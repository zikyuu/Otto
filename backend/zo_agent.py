"""Zo Telegram agent — "Otto comes to you."

Runs on a schedule (via Zo or cron). Fetches the current plan from the Otto
API, checks feasibility, and when the user is behind or a deadline is close,
fires a Telegram message with the single best next action and an offer to
reshuffle.

Uses OpenAI for message generation now; swap to Zo LLM once the API shape is
known — see _generate_message().

Env vars required:
    OTTO_API_URL        – base URL of the Otto backend (default http://localhost:8000)
    TELEGRAM_BOT_TOKEN  – from @BotFather
    TELEGRAM_CHAT_ID    – target chat / user id
    OPENAI_API_KEY      – for message generation (optional; falls back to template)
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date

import httpx
from dotenv import load_dotenv

load_dotenv()

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

OTTO_API = os.getenv("OTTO_API_URL", "http://localhost:8000")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")

DEADLINE_PROXIMITY_DAYS = 2
MODEL = "gpt-4o-mini"


# ---------------------------------------------------------------------------
# 0. Supabase user lookup
# ---------------------------------------------------------------------------

def _get_supabase():
    from app.database import get_supabase
    return get_supabase()


def _link_telegram(chat_id: int, profile_id: str) -> None:
    sb = _get_supabase()
    sb.table("profiles").update({"telegram_chat_id": str(chat_id)}).eq("id", profile_id).execute()


def _load_user(chat_id: int) -> dict | None:
    """Look up a user's profile, skills, goals, and walls by Telegram chat ID."""
    sb = _get_supabase()
    res = sb.table("profiles").select("*").eq("telegram_chat_id", str(chat_id)).execute()
    if not res.data:
        return None
    p = res.data[0]
    pid = p["id"]

    skills = sb.table("skills").select("*").eq("profile_id", pid).execute().data
    walls = sb.table("walls").select("*").eq("profile_id", pid).execute().data
    goals_raw = sb.table("goals").select("*").eq("profile_id", pid).execute().data

    goals = []
    for g in goals_raw:
        req = sb.table("goal_required_skills").select("skill_name").eq("goal_id", g["id"]).execute().data
        goals.append({
            "id": g["id"],
            "title": g["title"],
            "jd_text": g.get("jd_text", ""),
            "close_date": g.get("close_date", ""),
            "required_skills": [r["skill_name"] for r in req],
            "fit": g.get("fit", 0.5),
        })

    # load tasks to check which are done/missed
    tasks_raw = sb.table("tasks").select("*").execute().data
    goal_ids = {g["id"] for g in goals_raw}
    user_tasks = [t for t in tasks_raw if t.get("goal_id") in goal_ids]
    missed_ids = [t["id"] for t in user_tasks if t.get("status") in ("missed", "todo")]

    profile = {
        "skills": [{"id": s["id"], "name": s["name"], "proficiency": s["proficiency"]} for s in skills],
        "free_hours_per_day": p.get("free_hours_per_day", 3.0),
        "walls": [{"day": w["day"], "start_min": w["start_min"], "end_min": w["end_min"], "label": w.get("label", "")} for w in walls],
        "velocity": p.get("velocity", 0.8),
    }

    return {"profile": profile, "goals": goals, "profile_id": pid, "missed_task_ids": missed_ids}


# ---------------------------------------------------------------------------
# 1. Fetch current plan from Otto API
# ---------------------------------------------------------------------------

def fetch_plan(profile: dict, goals: list[dict], deadline_day: int = 4) -> dict:
    resp = httpx.post(
        f"{OTTO_API}/api/plan",
        json={"profile": profile, "goals": goals, "deadline_day": deadline_day},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()

def fetch_demo() -> dict:
    resp = httpx.get(f"{OTTO_API}/api/demo", timeout=10)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# 2. Decide whether to alert
# ---------------------------------------------------------------------------

def _days_until_deadline(close_date: str) -> int | None:
    if not close_date:
        return None
    try:
        dl = date.fromisoformat(close_date)
        return (dl - date.today()).days
    except ValueError:
        return None


def should_alert(plan: dict, goals: list[dict]) -> dict | None:
    """Return an alert context dict if the user needs a nudge, else None."""
    at_risk = plan.get("at_risk", [])
    tradeoff = plan.get("tradeoff")
    feasible = plan.get("feasible", True)

    deadline_close = False
    closest_goal = None
    for g in goals:
        days_left = _days_until_deadline(g.get("close_date", ""))
        if days_left is not None and days_left <= DEADLINE_PROXIMITY_DAYS:
            deadline_close = True
            closest_goal = g
            break

    if not at_risk and feasible and not deadline_close:
        return None

    return {
        "at_risk_ids": at_risk,
        "feasible": feasible,
        "tradeoff": tradeoff,
        "deadline_close": deadline_close,
        "closest_goal": closest_goal,
    }


# ---------------------------------------------------------------------------
# 3. Pick the single best next action
# ---------------------------------------------------------------------------

def best_next_action(tasks: list[dict], plan: dict) -> dict | None:
    """Return the highest-importance TODO task that is scheduled (has a block)."""
    scheduled_ids = {b["task_id"] for b in plan.get("blocks", [])}
    todo = [
        t for t in tasks
        if t.get("status", "todo") == "todo" and t["id"] in scheduled_ids
    ]
    if not todo:
        todo = [t for t in tasks if t.get("status", "todo") == "todo"]
    if not todo:
        return None
    todo.sort(key=lambda t: t.get("importance", 0), reverse=True)
    return todo[0]


# ---------------------------------------------------------------------------
# 4. Generate the Telegram message (OpenAI now, Zo LLM later)
# ---------------------------------------------------------------------------

def _generate_message(alert: dict, next_task: dict | None) -> str:
    """Build the nudge message. Uses OpenAI if available, else a template."""
    task_line = (
        f"🎯 Your top priority right now: *{next_task['title']}* "
        f"({next_task.get('est_minutes', '?')} min, serves _{next_task['skill_served']}_)."
        if next_task else "No pending tasks found."
    )

    if alert.get("tradeoff"):
        situation = alert["tradeoff"]["reason"]
    elif alert["deadline_close"] and alert.get("closest_goal"):
        g = alert["closest_goal"]
        situation = f"⏰ Deadline for \"{g['title']}\" is in {_days_until_deadline(g.get('close_date', ''))} day(s)."
    elif alert["at_risk_ids"]:
        situation = f"⚠️ {len(alert['at_risk_ids'])} task(s) are at risk of not fitting before the deadline."
    else:
        situation = "📉 You're falling behind your plan."

    if OPENAI_KEY and OpenAI is not None:
        try:
            client = OpenAI()
            r = client.chat.completions.create(
                model=MODEL,
                temperature=0.4,
                messages=[
                    {"role": "system", "content": (
                        "You are Otto, a calm and encouraging prep coach. Write a short Telegram "
                        "nudge (3-4 sentences max). Be honest, no guilt. Acknowledge "
                        "the user's effort so far before stating the situation. Give "
                        "the ONE best next action, and offer to reshuffle. Use "
                        "markdown bold for the task name. Use a few relevant emojis sparingly."
                    )},
                    {"role": "user", "content": (
                        f"Situation: {situation}\n"
                        f"Best next action: {task_line}\n"
                        f"Feasible: {alert['feasible']}"
                    )},
                ],
            )
            return r.choices[0].message.content
        except Exception:
            pass

    # TODO: swap to Zo LLM call once API shape is known
    lines = [
        f"👋 Hey — Otto here. {situation}",
        "",
        task_line,
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 5. Send via Telegram Bot API
# ---------------------------------------------------------------------------

def send_telegram(text: str, reply_markup: dict | None = None) -> bool:
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        print("[zo_agent] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — printing instead:")
        print(text)
        return False
    payload: dict = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "Markdown",
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)
    resp = httpx.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    return True


def _send_to(chat_id: int, text: str, reply_markup: dict | None = None) -> bool:
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }
    if reply_markup:
        payload["reply_markup"] = json.dumps(reply_markup)
    resp = httpx.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        json=payload,
        timeout=10,
    )
    resp.raise_for_status()
    return True


def _answer_callback(callback_query_id: str) -> None:
    httpx.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/answerCallbackQuery",
        json={"callback_query_id": callback_query_id},
        timeout=10,
    )


# ---------------------------------------------------------------------------
# 6. Buttons
# ---------------------------------------------------------------------------

MAIN_MENU = {
    "inline_keyboard": [
        [
            {"text": "🔄 Reshuffle", "callback_data": "reshuffle"},
            {"text": "📊 Status", "callback_data": "status"},
        ],
    ],
}

RESHUFFLE_BUTTON = {
    "inline_keyboard": [
        [{"text": "🔄 Reshuffle my week", "callback_data": "reshuffle"}],
    ],
}


# ---------------------------------------------------------------------------
# 7. Scheduled nudge
# ---------------------------------------------------------------------------

def run(profile: dict, goals: list[dict], deadline_day: int = 4) -> str | None:
    """Check feasibility and send a Telegram nudge if needed."""
    data = fetch_plan(profile, goals, deadline_day)
    plan = data["plan"]
    tasks = data.get("tasks", [])

    alert = should_alert(plan, goals)
    if alert is None:
        print("[zo_agent] All good — no alert needed.")
        return None

    next_task = best_next_action(tasks, plan)
    message = _generate_message(alert, next_task)
    send_telegram(message, reply_markup=RESHUFFLE_BUTTON)
    return message


def run_demo():
    """Run against the demo data — useful for testing without full setup."""
    from app.llm.extract import parse_resume, parse_jd

    demo = fetch_demo()
    profile = parse_resume(demo["resume_text"]).to_dict()
    goal = parse_jd(demo["demo_jd"]).to_dict()
    profile["velocity"] = 0.4
    profile["walls"] = demo["walls"]
    return run(profile, [goal], deadline_day=4)


# ---------------------------------------------------------------------------
# 8. Telegram polling — listens for commands & button taps
# ---------------------------------------------------------------------------

_last_state: dict = {}


def _ensure_user(chat_id: int) -> dict | None:
    """Load user data from Supabase, caching in _last_state."""
    cached = _last_state.get(str(chat_id))
    if cached:
        return cached
    user = _load_user(chat_id)
    if user:
        _last_state[str(chat_id)] = user
    return user


def _handle_reshuffle(chat_id: int) -> None:
    """Call /api/reshuffle with the user's real data and reply."""
    # clear cache so we get fresh task statuses from DB
    _last_state.pop(str(chat_id), None)
    user = _ensure_user(chat_id)
    if not user:
        _send_to(chat_id, "😅 I don't know you yet. Set up your profile on the web app first, then link with /start.", reply_markup=MAIN_MENU)
        return
    profile = user["profile"]
    goals = user["goals"]

    _send_to(chat_id, "🔄 Reshuffling your week...")

    resp = httpx.post(
        f"{OTTO_API}/api/reshuffle",
        json={
            "profile": profile,
            "goals": goals,
            "deadline_day": 4,
            "missed_task_ids": user.get("missed_task_ids", []),
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    narration = data.get("narration", "")
    plan = data.get("plan", {})
    tasks = data.get("tasks", [])

    next_task = best_next_action(tasks, plan)
    task_line = (
        f"🎯 Top priority now: *{next_task['title']}* ({next_task.get('est_minutes', '?')} min)."
        if next_task else ""
    )

    lines = [f"✅ {narration}"]
    if task_line:
        lines += ["", task_line]
    _send_to(chat_id, "\n".join(lines), reply_markup=MAIN_MENU)


def _handle_status(chat_id: int) -> None:
    """Check feasibility and reply with status, even if everything is fine."""
    _last_state.pop(str(chat_id), None)
    user = _ensure_user(chat_id)
    if not user:
        _send_to(chat_id, "😅 I don't know you yet. Set up your profile on the web app first, then link with /start.", reply_markup=MAIN_MENU)
        return
    profile = user["profile"]
    goals = user["goals"]
    data = fetch_plan(profile, goals, 4)
    plan = data["plan"]
    tasks = data.get("tasks", [])

    alert = should_alert(plan, goals)
    if alert is None:
        next_task = best_next_action(tasks, plan)
        if next_task:
            _send_to(
                chat_id,
                f"✅ You're on track! Next up: *{next_task['title']}* ({next_task.get('est_minutes', '?')} min).",
                reply_markup=MAIN_MENU,
            )
        else:
            _send_to(chat_id, "✅ You're on track — nothing at risk right now! 🎉", reply_markup=MAIN_MENU)
        return

    next_task = best_next_action(tasks, plan)
    message = _generate_message(alert, next_task)
    _send_to(chat_id, message, reply_markup=RESHUFFLE_BUTTON)


def poll() -> None:
    """Long-poll Telegram for commands and button taps. Blocks forever."""
    import time

    # flush old updates so we only react to new messages
    try:
        old = httpx.get(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates",
            params={"timeout": 0}, timeout=10,
        ).json().get("result", [])
        offset = old[-1]["update_id"] + 1 if old else 0
    except Exception:
        offset = 0

    print("[zo_agent] 🤖 Polling for Telegram messages... (Ctrl+C to stop)")
    while True:
        try:
            resp = httpx.get(
                f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/getUpdates",
                params={"offset": offset, "timeout": 30},
                timeout=35,
            )
            updates = resp.json().get("result", [])
        except Exception as e:
            print(f"[zo_agent] Poll error: {e}")
            time.sleep(5)
            continue

        for update in updates:
            offset = update["update_id"] + 1

            # --- handle button taps (callback queries) ---
            callback = update.get("callback_query")
            if callback:
                chat_id = callback["message"]["chat"]["id"]
                cb_data = callback.get("data", "")
                _answer_callback(callback["id"])
                print(f"[zo_agent] 🔘 button '{cb_data}' from {chat_id}")

                if cb_data == "reshuffle":
                    _handle_reshuffle(chat_id)
                elif cb_data == "status":
                    _handle_status(chat_id)
                continue

            # --- handle text messages ---
            msg = update.get("message", {})
            text = msg.get("text", "").strip()
            chat_id = msg.get("chat", {}).get("id")
            if not chat_id:
                continue

            print(f"[zo_agent] 💬 got '{text}' from {chat_id}")

            if text.lower().startswith("/start"):
                parts = text.split()
                if len(parts) > 1:
                    profile_id = parts[1]
                    _link_telegram(chat_id, profile_id)
                    _last_state.pop(str(chat_id), None)
                    _send_to(
                        chat_id,
                        "🔗 Linked! I can see your profile now.\n\n👋 I'm *Otto*, your prep coach. Tap a button below!",
                        reply_markup=MAIN_MENU,
                    )
                else:
                    user = _load_user(chat_id)
                    if user:
                        _send_to(
                            chat_id,
                            f"👋 Welcome back! I can see your profile. Tap a button below!",
                            reply_markup=MAIN_MENU,
                        )
                    else:
                        _send_to(
                            chat_id,
                            "👋 Hey! I'm *Otto*, your prep coach.\n\n"
                            "To link your account, tap the *Connect Telegram* button "
                            "in the Otto web app after setting up your plan.",
                            reply_markup=MAIN_MENU,
                        )
            elif text.lower() == "/reshuffle":
                _handle_reshuffle(chat_id)
            elif text.lower() == "/status":
                _handle_status(chat_id)
            else:
                _send_to(chat_id, "🤔 I don't recognise that. Try the buttons below!", reply_markup=MAIN_MENU)


if __name__ == "__main__":
    if "--demo" in sys.argv:
        run_demo()
    elif "--poll" in sys.argv:
        poll()
    else:
        print("Usage:")
        print("  python -m zo_agent --demo    One-shot nudge check")
        print("  python -m zo_agent --poll    Listen for /reshuffle commands")
