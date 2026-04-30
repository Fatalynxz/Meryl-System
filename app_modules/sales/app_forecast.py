from datetime import datetime, timedelta


def build_forecast_periods(forecast_range, *, datetime_cls=datetime):
    normalized = (forecast_range or "last6").strip().lower()
    today = datetime_cls.now().date()
    month_start = today.replace(day=1)

    def shift_month(date_value, offset):
        month_index = (date_value.year * 12 + date_value.month - 1) + offset
        year = month_index // 12
        month = month_index % 12 + 1
        return datetime_cls(year, month, 1).date()

    if normalized == "last12":
        period_starts = [shift_month(month_start, offset) for offset in range(-11, 1)]
    elif normalized == "yearly":
        period_starts = [datetime_cls(today.year, month, 1).date() for month in range(1, 13)]
        normalized = "yearly"
    else:
        normalized = "last6"
        period_starts = [shift_month(month_start, offset) for offset in range(-5, 1)]

    return normalized, period_starts


def build_demand_range_buckets(demand_range, *, datetime_cls=datetime, timedelta_cls=timedelta):
    today = datetime_cls.now().date()
    normalized = (demand_range or "last30").strip().lower()

    if normalized == "weekly":
        buckets = []
        week_start = today - timedelta_cls(days=today.weekday())
        for offset in range(7):
            current_day = week_start + timedelta_cls(days=offset)
            buckets.append(
                {
                    "label": current_day.strftime("%a"),
                    "start": current_day,
                    "end": current_day,
                }
            )
        return normalized, buckets

    if normalized == "yearly":
        buckets = []
        for month in range(1, 13):
            start_day = datetime_cls(today.year, month, 1).date()
            if month == 12:
                end_day = datetime_cls(today.year, 12, 31).date()
            else:
                end_day = (datetime_cls(today.year, month + 1, 1) - timedelta_cls(days=1)).date()
            buckets.append(
                {
                    "label": start_day.strftime("%b"),
                    "start": start_day,
                    "end": end_day,
                }
            )
        return normalized, buckets

    normalized = "last30"
    bucket_ranges = [(24, 29), (18, 23), (12, 17), (6, 11), (0, 5)]
    buckets = []
    for start_offset, end_offset in bucket_ranges:
        range_start = today - timedelta_cls(days=start_offset)
        range_end = today - timedelta_cls(days=end_offset)
        start_day = min(range_start, range_end)
        end_day = max(range_start, range_end)
        buckets.append(
            {
                "label": f"{start_day.strftime('%b %d')} - {end_day.strftime('%b %d')}",
                "start": start_day,
                "end": end_day,
            }
        )
    return normalized, buckets


def moving_average_forecast(values, window=3, *, safe_float):
    cleaned = [safe_float(value, 0) for value in values]
    if not cleaned:
        return 0.0
    usable_window = max(1, min(window, len(cleaned)))
    recent_values = cleaned[-usable_window:]
    return round(sum(recent_values) / usable_window, 2)


def weighted_moving_average_forecast(values, window=4, *, safe_float):
    cleaned = [safe_float(value, 0) for value in values if safe_float(value, 0) >= 0]
    if not cleaned:
        return 0.0
    usable_window = max(1, min(window, len(cleaned)))
    recent_values = cleaned[-usable_window:]
    weights = list(range(1, usable_window + 1))
    weighted_total = sum(value * weight for value, weight in zip(recent_values, weights))
    return round(weighted_total / sum(weights), 2)


def linear_regression_forecast(values, *, safe_float):
    cleaned = [safe_float(value, 0) for value in values]
    if not cleaned:
        return 0.0
    if len(cleaned) == 1:
        return round(cleaned[0], 2)

    count = len(cleaned)
    x_values = list(range(1, count + 1))
    sum_x = sum(x_values)
    sum_y = sum(cleaned)
    sum_xy = sum(x * y for x, y in zip(x_values, cleaned))
    sum_x2 = sum(x * x for x in x_values)
    denominator = (count * sum_x2) - (sum_x ** 2)
    if denominator == 0:
        return round(cleaned[-1], 2)

    slope = ((count * sum_xy) - (sum_x * sum_y)) / denominator
    intercept = (sum_y - (slope * sum_x)) / count
    next_value = intercept + (slope * (count + 1))
    return round(max(next_value, 0), 2)


def blended_recent_forecast(values, *, safe_float, moving_average_forecast_fn, weighted_moving_average_forecast_fn, linear_regression_forecast_fn):
    cleaned = [safe_float(value, 0) for value in values if safe_float(value, 0) > 0]
    if not cleaned:
        return 0.0
    if len(cleaned) == 1:
        return round(cleaned[0], 2)

    recent_average = moving_average_forecast_fn(cleaned, window=min(3, len(cleaned)))
    weighted_average = weighted_moving_average_forecast_fn(cleaned, window=min(4, len(cleaned)))
    trend_projection = linear_regression_forecast_fn(cleaned)
    latest_value = cleaned[-1]
    if len(cleaned) == 2:
        return round(max(weighted_average, recent_average, latest_value), 2)

    blended_value = (weighted_average * 0.5) + (trend_projection * 0.3) + (recent_average * 0.2)
    minimum_floor = latest_value * 0.85
    return round(max(blended_value, minimum_floor, recent_average), 2)
