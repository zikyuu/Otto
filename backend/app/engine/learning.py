#updates Profile from user signals 
#never called by scheduler directly
#expected flow: user action -> API endpoint logs signal -> learning.py updates Profile
#. profile saved to DB -> next /api/plan call uses the updated profile 
# keep this pure: no I/O, LLM etc (our own engineered algorithm)

from __future__ import annotations

from app.models import (
    EnergyLog, OffTrackLog, Profile, ReflectionChoice, TaskReflection
)

EMA_WEIGHT = 0.2 #recent signal weights 20%, history 80% (accounts for outlier days, can adjust later)
# roughly 5 recent sessions to meaningully shift a pattern

def update_velocity(profile: Profile, reflection: TaskReflection) -> Profile:
    """Update the user's velocity based on a task reflection signal."""
    # Calculate the new velocity using exponential moving average
    #only updates if user picks HARDER /EASIER THAN EXPECTED / NAILED
    #disregarded if user picks OUTLIER, INTERRUPTED etc
    if reflection.choice in [ReflectionChoice.OUTLIER, ReflectionChoice.INTERRUPTED, ReflectionChoice.GAP]:
        return profile  # No update for outlier or interrupted sessions
    #everything else (aka EASIER, HARDER, NAILED) updates the velocity
    ratio = reflection.actual_minutes / max(reflection.planned_minutes,1)

    category = getattr(reflection, 'category', 'deep_work') #default set to DW, but API endpoint will pass the realcategory

    current = profile.avg_velocity.get(category, 1.0)  # Default to 1.0 if not present
    updated = (1 - EMA_WEIGHT) * current + EMA_WEIGHT * ratio
    profile.avg_velocity[category] = round(updated, 3)  # Round to 2 decimal places for consistency
    return profile


def update_peak_window(profile: Profile) -> Profile:
    """Update the user's peak window based on energy log signals."""
    if len(profile.energy_logs) < 10: 
        return profile  # Not enough data to update peak window, keep to default cold start
    hour_scores: dict[int, list[int]] = {}
    for log in profile.energy_logs:
        hour = int(log.ts[11:13])  # Extract hour from timestamp
        hour_scores.setdefault(hour, []).append(log.level)

        avg_by_hour = {h: sum(v) / len(v) for h, v in hour_scores.items()}
        best_start, best_score = profile.peak_window[0], 0.0
        for h in range (6,21): #6am to 9pm
            window_score = sum(avg_by_hour.get(h+i, 0) for i in range(3)) #3 hour window
            if score > best_score:
                best_start, best_score = h, score

        profile.peak_window = (best_start, best_start + 3)
        return profile

    def update_completion_rate(profile: Profile, done: bool, planned_minutes: int) -> Profile:
        #update overall completion rate after any task is marked done/missing
        signal = 1.0 if done else 0.0
        profile.completion_rate = round((1 - EMA_WEIGHT) * profile.completion_rate + EMA_WEIGHT * signal,3)
        return profile

    def apply_all_signals(profile: Profile, reflection: TaskReflection) -> Profile: 
        profile = update_velocity(profile, reflection)
        profile = update_peak_window(profile)
        profile = update_completion_rate(profile, done=reflection.actual_minutes > 0, planned_minutes=reflection.planned_minutes)
        return profile

    