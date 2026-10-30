"""An event's `day` is a day number: whole days since 1 Jan 1970 on the local calendar. It is unique across months and years, so
the calendar can show any week or month from real dates. The server only compares these numbers (and maps them to positions
in the list of days it is given); this module converts to and from real dates where a date is needed."""
from __future__ import annotations

from datetime import date, timedelta

EPOCH = date(1970, 1, 1)


def day_of(d: date) -> int:
    return (d - EPOCH).days


def date_of(n: int) -> date:
    return EPOCH + timedelta(days=n)
