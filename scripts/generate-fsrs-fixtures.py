"""FSRS-6 formula oracle; does not import ts-fsrs or the application adapter."""

import hashlib
import json
import math
from datetime import datetime, timedelta
from pathlib import Path


CONFIG = {
    "model": "FSRS-6",
    "libraryName": "ts-fsrs",
    "libraryVersion": "6.0.0",
    "weights": [
        0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
        0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
        1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
    ],
    "retention": 0.9,
    "learningStepsMinutes": [1, 10],
    "relearningStepsMinutes": [10],
    "enableFuzz": False,
    "enableShortTerm": True,
    "maximumIntervalDays": 36500,
    "fractionalDays": False,
    "roundingPolicy": "ts-fsrs@6.0.0/native",
    "stepPolicy": "ts-fsrs@6.0.0/native;graduatingInterval=1;allowModelOverride=false",
}
CONFIG_ID = hashlib.sha256(
    json.dumps(CONFIG, separators=(",", ":")).encode()
).hexdigest()
W = CONFIG["weights"]


def instant(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso(value):
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def memory(stability, difficulty, elapsed, rating):
    initial_d = lambda grade: W[4] + 1 - math.exp(W[5] * (grade - 1))
    if stability == 0:
        return W[rating - 1], max(1, min(10, initial_d(rating)))
    next_d = difficulty - W[6] * (rating - 3) * (10 - difficulty) / 9
    next_d = max(1, min(10, W[7] * initial_d(4) + (1 - W[7]) * next_d))
    if elapsed == 0:
        increase = math.exp(W[17] * (rating - 3 + W[18])) * stability ** -W[19]
        next_s = stability * (max(1, increase) if rating >= 2 else increase)
    else:
        factor = 0.9 ** (-1 / W[20]) - 1
        recall = (1 + factor * elapsed / stability) ** -W[20]
        if rating == 1:
            forgotten = (W[11] * difficulty ** -W[12]
                         * ((stability + 1) ** W[13] - 1)
                         * math.exp(W[14] * (1 - recall)))
            next_s = min(forgotten, stability / math.exp(W[17] * W[18]))
        else:
            penalty = W[15] if rating == 2 else 1
            next_s = stability * (1 + math.exp(W[8]) * (11 - difficulty)
                                  * stability ** -W[9]
                                  * (math.exp(W[10] * (1 - recall)) - 1) * penalty)
    return max(0.001, min(36500, next_s)), next_d


def progress(state="review", **changes):
    return {
        "state": state, "dueAt": "2026-01-11T12:00:00.000Z",
        "stability": 10, "difficulty": 5, "elapsedDays": 3,
        "scheduledDays": 10, "reps": 8, "lapses": 1, "learningSteps": 0,
        "lastReviewAt": "2026-01-01T12:00:00.000Z",
        "schedulerConfigId": CONFIG_ID, **changes,
    }


# Per-rating step delays are independently enumerated from the locked policy.
# None means graduate/use the model's long-term interval.
CASES = [
    ("new", None, "2026-01-01T12:00:00.000Z", [1, 5.5, 10]),
    ("learning-first-step", progress("learning", stability=0.212, difficulty=6.4133,
                                    scheduledDays=0, dueAt="2026-01-01T12:01:00.000Z"),
     "2026-01-01T12:01:00.000Z", [1, 5.5, 10]),
    ("learning-graduation", progress("learning", stability=2.3065, difficulty=2.11810397,
                                    learningSteps=1, scheduledDays=0,
                                    dueAt="2026-01-01T12:10:00.000Z"),
     "2026-01-01T12:10:00.000Z", [1, 5.5, None]),
    ("review-due", progress(), "2026-01-11T12:00:00.000Z", [10, None, None]),
    ("relearning", progress("relearning", stability=1.5, difficulty=6, scheduledDays=0,
                           dueAt="2026-01-01T12:10:00.000Z"),
     "2026-01-01T12:10:00.000Z", [10, 15, None]),
    ("intraday-early-review", progress(), "2026-01-01T18:00:00.000Z", [10, None, None]),
    ("overdue", progress(), "2026-02-15T12:00:00.000Z", [10, None, None]),
    ("utc-midnight", progress(lastReviewAt="2026-01-01T23:00:00.000Z"),
     "2026-01-02T01:00:00.000Z", [10, None, None]),
    ("maximum-interval", progress(stability=36500, difficulty=1),
     "2026-01-11T12:00:00.000Z", [10, None, None]),
]


def reference_case(name, before, timestamp, delays):
    now = instant(timestamp)
    elapsed = (now.date() - instant(before["lastReviewAt"]).date()).days if before else 0
    expected = []
    previous_long_interval = 0
    previous_seconds = 0
    for rating, minutes in enumerate(delays, start=1):
        stability, difficulty = memory(
            before["stability"] if before else 0,
            before["difficulty"] if before else 0, elapsed, rating,
        )
        if minutes is not None:
            seconds = max(minutes * 60, previous_seconds)
            state = "relearning" if before and before["state"] in ("review", "relearning") else "learning"
            step = (1 if rating == 3 else before["learningSteps"] if before and rating == 2 else 0)
        else:
            # Retention 0.90 makes the unrounded long-term interval equal S'.
            days = min(36500, max(1, math.floor(stability + 0.5), previous_long_interval + 1))
            previous_long_interval = days
            seconds, state, step = days * 86400, "review", 0
        previous_seconds = seconds
        expected.append({
            "rating": rating,
            "progress": {
                "state": state, "dueAt": iso(now + timedelta(seconds=seconds)),
                "stability": stability, "difficulty": difficulty,
                "elapsedDays": elapsed, "scheduledDays": math.floor(seconds / 86400),
                "reps": (before["reps"] if before else 0) + 1,
                "lapses": (before["lapses"] if before else 0)
                          + int(bool(before and before["state"] == "review" and rating == 1)),
                "learningSteps": step, "lastReviewAt": timestamp,
                "schedulerConfigId": CONFIG_ID,
            },
        })
    return {"name": name, "progress": before, "now": timestamp, "expected": expected}


fixture = {
    "reference": {
        "source": "https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm#fsrs-6",
        "checkedAt": "2026-11-06",
        "method": "Independent FSRS-6 formulas plus enumerated ts-fsrs 6.0.0 step policy; unrounded memory values",
        "relativeMemoryTolerance": 0.0000001,
    },
    "config": {"_id": CONFIG_ID, **CONFIG},
    "cases": [reference_case(*case) for case in CASES],
}
target = Path(__file__).resolve().parents[1] / "tests/fixtures/fsrs-reference.json"
target.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
