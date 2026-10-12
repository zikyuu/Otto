"""Load a believable month of habit signals into the learned profile so the app has something to adapt to.

    python scripts/seed_demo.py            seed (backs up any existing profile first)
    python scripts/seed_demo.py --restore  put the backed-up profile back
    python scripts/seed_demo.py --reset    delete the profile (back to a cold start)

Signals go through the real learning functions, so what you see afterwards (peak window, pace, focus span,
gym-first, recovery, planning bias...) is what Otto would have learned, not hand-typed numbers.
The persona: sharpest 2-5pm, a slump after lunch, finishes the gym before deep work, loses focus about
95 minutes into long sessions, runs ~35% over on deep work, flat on admin.
"""
from __future__ import annotations

import random
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import store                                   # noqa: E402
from app.engine import learning as L                     # noqa: E402
from app.models import EnergyLog, OffTrackLog, Profile, ReflectionChoice as RC, TaskReflection  # noqa: E402

WEEKS = 4


def backup_path() -> Path:
    p = store._path()
    return p.with_name(p.name + ".bak")


def build(today: date | None = None, seed: int = 7) -> Profile:
    rnd = random.Random(seed)
    today = today or date.today()
    p = Profile()
    days = [today - timedelta(days=n) for n in range(WEEKS * 7, 0, -1)]
    workdays = [d for d in days if d.weekday() < 5]
    ts = lambda d, h, m=0: datetime(d.year, d.month, d.day, h, m).isoformat(timespec="minutes")

    # --- energy: tap a few times a day. Low mornings, a slump after lunch, best 14:00-17:00, tired evenings ----
    curve = {9: 2.6, 10: 3.0, 11: 3.0, 12: 2.6, 13: 1.9, 14: 4.2, 15: 4.6, 16: 4.3, 17: 3.4, 19: 2.8}
    for d in workdays:
        for h in rnd.sample(list(curve), k=rnd.randint(4, 6)):
            level = min(5, max(1, round(curve[h] + rnd.uniform(-.8, .8))))
            L.add_energy_log(p, EnergyLog(ts=ts(d, h, rnd.choice([5, 20, 40])), level=level))
    # a few taps right after meetings: still drained 30-50 minutes later
    for d in workdays[::3]:
        L.add_energy_log(p, EnergyLog(ts=ts(d, 11, 50), level=rnd.choice([1, 2]), after_meeting_min=rnd.choice([30, 40, 50])))

    # --- reflections ---------------------------------------------------------------------------------------
    def reflect(d, hh, mm, task, choice, planned, actual, cat):
        L.apply_all_signals(p, TaskReflection(task_id=task, ts=ts(d, hh, mm), choice=choice, planned_minutes=planned, actual_minutes=actual, category=cat))

    for i, d in enumerate(workdays):
        # gym first on most days: done before the deep work
        if i % 4 != 3:
            reflect(d, 9, 0, f"gym-{i}", RC.NAILED, 60, rnd.choice([58, 60, 62]), "physical")
        planned = rnd.choice([45, 60, 90, 120, 150])
        actual = round(planned * 1.3 + 15 + rnd.uniform(-8, 8))          # deep work runs ~30% over, plus a warm-up
        choice = rnd.choices([RC.HARDER, RC.NAILED, RC.OUTLIER, RC.INTERRUPTED], [5, 3, 1, 1])[0]
        reflect(d, 15, 30, f"deep-{i}", choice, planned, actual if choice != RC.NAILED else planned, "deep_work")
        if i % 3 == 0:
            reflect(d, 11, 10, f"admin-{i}", RC.NAILED, 20, rnd.choice([18, 20, 22]), "admin")
        if i % 6 == 0:
            reflect(d, 16, 45, f"creative-{i}", RC.HARDER, 60, 75, "creative")
    # one real skill gap, flagged so it can show up against a goal
    reflect(workdays[-2], 16, 30, "system-design-urls", RC.GAP, 90, 140, "deep_work")
    # long sessions that went fine: the user can hold focus for a while
    for d in workdays[-8::2]:
        reflect(d, 17, 30, f"long-{d.day}", RC.NAILED, 150, 155, "deep_work")

    # --- off-track labels: focus fades about 90-110 minutes in -------------------------------------------------
    for d in workdays[::2]:
        L.add_off_track(p, OffTrackLog(ts=ts(d, 16, 50), duration_min=rnd.choice([10, 15, 25]), reason=rnd.choice(["couldnt_focus", "doomscrolled", "messages"]),
                                       task_id=f"deep-{d.day}", into_task_min=rnd.choice([90, 95, 100, 110])))
    L.add_off_track(p, OffTrackLog(ts=ts(workdays[5], 14, 0), duration_min=180, reason="medical"))
    L.add_off_track(p, OffTrackLog(ts=ts(workdays[9], 10, 0), duration_min=20, reason="break", into_task_min=60))

    # --- done / missed marks: finishes about 70% of what is planned ----------------------------------------------
    for k in range(30):
        L.record_completion(p, done=rnd.random() < 0.7, planned_minutes=60)
    return p


def main(argv: list[str]) -> None:
    path = store._path()
    if "--restore" in argv:
        if not backup_path().exists():
            sys.exit(f"nothing to restore ({backup_path()} does not exist)")
        shutil.copy(backup_path(), path)
        print(f"restored {path} from {backup_path().name}")
        return
    if "--reset" in argv:
        path.unlink(missing_ok=True)
        print(f"deleted {path}; Otto is back to a cold start")
        return
    if path.exists() and not backup_path().exists():
        shutil.copy(path, backup_path())
        print(f"backed up the existing profile to {backup_path().name}")
    p = build()
    store.save_profile(p)
    print(f"wrote {path}\n")
    print(f"  signals       {len(p.energy_logs)} energy taps, {len(p.reflections)} reflections, {len(p.off_track_logs)} off-track labels")
    print(f"  peak window   {p.peak_window[0]}:00-{p.peak_window[1]}:00 (Otto reads you as a {L.chronotype(p)} person)")
    print(f"  pace          deep work x{p.avg_velocity['deep_work']}, creative x{p.avg_velocity['creative']}, admin x{p.avg_velocity['admin']}")
    print(f"  focus span    {p.focus_span_min} min (from {p.focus_evidence} observations)")
    print(f"  ramp-up       deep work {p.ramp_up_min['deep_work']} min")
    print(f"  post-lunch    {p.post_meal_slump_min} min slump")
    print(f"  after a call  {p.recovery_after_meeting} min recovery ({p.recovery_evidence} observations)")
    print(f"  gym first     {p.gym_first} ({p.gym_evidence} days compared)")
    print(f"  planning      {p.planning_bias:.2f} of free hours, completion rate {p.completion_rate:.2f}")
    print(f"  skill gaps    {p.gap_task_ids}")


if __name__ == "__main__":
    main(sys.argv[1:])
