import statistics
from collections.abc import Sequence


def calc_mean(x: Sequence[float], y: Sequence[float]) -> float:
    if len(x) != len(y) or not x:
        raise ValueError("x and y must have the same non-zero length")

    return statistics.mean(y)


def calc_barrier(x: Sequence[float], y: Sequence[float]) -> float:
    if len(x) != len(y) or not x:
        raise ValueError("x and y must have the same non-zero length")

    return max(y) - min(y)


def calc_peak_distance(x: Sequence[float], y: Sequence[float]) -> float:
    if len(x) != len(y) or not x:
        raise ValueError("x and y must have the same non-zero length")

    left = [(xi, yi) for xi, yi in zip(x, y) if xi < 0]
    right = [(xi, yi) for xi, yi in zip(x, y) if xi > 0]

    if not left or not right:
        raise ValueError("x must contain values on both sides of 0")

    x_left = max(left, key=lambda p: p[1])[0]
    x_right = max(right, key=lambda p: p[1])[0]

    return x_right - x_left
