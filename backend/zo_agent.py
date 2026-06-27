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


def _handle_reshuffle(chat_id: int) -> None:
    """Call /api/reshuffle with the last known state and reply."""
    profile = _last_state.get("profile")
    goals = _last_state.get("goals")
    if not profile or not goals:
        _send_to(chat_id, "😅 I don't have a plan loaded yet. Hit 📊 *Status* first!", reply_markup=MAIN_MENU)
        return

    _send_to(chat_id, "🔄 Reshuffling your week...")

    resp = httpx.post(
        f"{OTTO_API}/api/reshuffle",
        json={
            "profile": profile,
            "goals": goals,
            "deadline_day": _last_state.get("deadline_day", 4),
            "missed_task_ids": _last_state.get("missed_task_ids", []),
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


def _handle_status(chat_id: int, profile: dict, goals: list[dict], deadline_day: int) -> None:
    """Check feasibility and reply with status, even if everything is fine."""
    data = fetch_plan(profile, goals, deadline_day)
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


def poll(profile: dict, goals: list[dict], deadline_day: int = 4,
         missed_task_ids: list[str] | None = None) -> None:
    """Long-poll Telegram for commands and button taps. Blocks forever."""
    import time

    _last_state.update({
        "profile": profile,
        "goals": goals,
        "deadline_day": deadline_day,
        "missed_task_ids": missed_task_ids or [],
    })

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
                data = callback.get("data", "")
                _answer_callback(callback["id"])
                print(f"[zo_agent] 🔘 button '{data}' from {chat_id}")

                if data == "reshuffle":
                    _handle_reshuffle(chat_id)
                elif data == "status":
                    _handle_status(chat_id, profile, goals, deadline_day)
                continue

            # --- handle text messages ---
            msg = update.get("message", {})
            text = msg.get("text", "").strip().lower()
            chat_id = msg.get("chat", {}).get("id")
            if not chat_id:
                continue

            print(f"[zo_agent] 💬 got '{text}' from {chat_id}")
            if text == "/start":
                _send_to(
                    chat_id,
                    "👋 Hey! I'm *Otto*, your prep coach.\n\nTap a button below to get started!",
                    reply_markup=MAIN_MENU,
                )
            elif text == "/reshuffle":
                _handle_reshuffle(chat_id)
            elif text == "/status":
                _handle_status(chat_id, profile, goals, deadline_day)
            else:
                _send_to(chat_id, "🤔 I don't recognise that. Try the buttons below!", reply_markup=MAIN_MENU)


def poll_demo():
    """Poll with demo data — for testing the /reshuffle flow."""
    from app.llm.extract import parse_resume, parse_jd

    demo = fetch_demo()
    profile = parse_resume(demo["resume_text"]).to_dict()
    goal = parse_jd(demo["demo_jd"]).to_dict()
    profile["velocity"] = 0.4
    profile["walls"] = demo["walls"]
    poll(profile, [goal], deadline_day=4)


if __name__ == "__main__":
    if "--demo" in sys.argv:
        run_demo()
    elif "--poll" in sys.argv:
        poll_demo()
    else:
        print("Usage:")
        print("  python -m zo_agent --demo    One-shot nudge check")
        print("  python -m zo_agent --poll    Listen for /reshuffle commands")
