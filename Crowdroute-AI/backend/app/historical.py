"""Historical Data Ingestion, Validation, and Empirical Profiling for CrowdRoute AI.
Processes CSV and Excel uploads for previous festival passenger counts, boarding records,
and empirical time-of-day demand patterns. Never invents data.
"""

import csv
import io
from typing import Any, Dict, List, Optional, Tuple
from openpyxl import load_workbook

from app.models import (
    ActualVsPredictedInterval,
    ActualVsPredictedSummary,
    HistoricalRecord,
    HistoricalUploadResponse,
    validate_hh_mm_string,
)


# Column aliases for flexible mapping
TIME_ALIASES = ["time", "timestamp", "interval", "time_slot", "time_interval", "hour_minute"]
STOP_ALIASES = ["stop_id", "stop", "station", "terminal", "stop_name", "location"]
PASSENGER_ALIASES = [
    "passengers",
    "passenger_count",
    "boardings",
    "boarding_count",
    "count",
    "demand",
    "ridership",
    "tickets",
]


def detect_column_mapping(columns: List[str]) -> Tuple[Dict[str, str], List[str]]:
    """Detects standard column roles from uploaded header names."""
    mapping: Dict[str, str] = {}
    missing: List[str] = []

    norm_cols = {c.strip().lower().replace(" ", "_"): c for c in columns}

    # Match time column
    time_col = None
    for alias in TIME_ALIASES:
        if alias in norm_cols:
            time_col = norm_cols[alias]
            break
    if time_col:
        mapping["time"] = time_col
    else:
        missing.append("time (e.g. 'time', 'timestamp', 'interval')")

    # Match stop column
    stop_col = None
    for alias in STOP_ALIASES:
        if alias in norm_cols:
            stop_col = norm_cols[alias]
            break
    if stop_col:
        mapping["stop_id"] = stop_col
    else:
        missing.append("stop_id (e.g. 'stop_id', 'stop', 'station')")

    # Match passenger column
    pax_col = None
    for alias in PASSENGER_ALIASES:
        if alias in norm_cols:
            pax_col = norm_cols[alias]
            break
    if pax_col:
        mapping["passengers"] = pax_col
    else:
        missing.append("passengers (e.g. 'passengers', 'boardings', 'count', 'demand')")

    return mapping, missing


def parse_and_validate_historical_file(
    file_bytes: bytes,
    filename: str,
    custom_mapping: Optional[Dict[str, str]] = None,
) -> HistoricalUploadResponse:
    """Parses and validates CSV or Excel upload into structured HistoricalRecord list."""
    fname_lower = filename.lower()
    raw_rows: List[Dict[str, Any]] = []
    headers: List[str] = []

    try:
        if fname_lower.endswith(".csv"):
            text_stream = io.StringIO(file_bytes.decode("utf-8-sig", errors="replace"))
            reader = csv.DictReader(text_stream)
            if reader.fieldnames:
                headers = list(reader.fieldnames)
            for row in reader:
                raw_rows.append(row)
        elif fname_lower.endswith((".xlsx", ".xls")):
            wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            rows_iter = sheet.iter_rows(values_only=True)
            first_row = next(rows_iter, None)
            if first_row:
                headers = [str(cell).strip() for cell in first_row if cell is not None]
            for r in rows_iter:
                if any(cell is not None for cell in r):
                    row_dict = {}
                    for idx, val in enumerate(r):
                        if idx < len(headers):
                            row_dict[headers[idx]] = str(val).strip() if val is not None else ""
                    raw_rows.append(row_dict)
        else:
            return HistoricalUploadResponse(
                filename=filename,
                status="INVALID_FILE",
                total_rows=0,
                valid_rows=0,
                invalid_rows_count=0,
                detected_columns=[],
                column_mapping={},
                stop_ids_found=[],
                total_passenger_count=0,
                records=[],
                validation_errors=[f"Unsupported file format '{filename}'. Please upload a CSV (.csv) or Excel (.xlsx) file."],
                data_provenance="Upload validation failed: unsupported file extension.",
            )
    except Exception as exc:
        return HistoricalUploadResponse(
            filename=filename,
            status="INVALID_FILE",
            total_rows=0,
            valid_rows=0,
            invalid_rows_count=0,
            detected_columns=[],
            column_mapping={},
            stop_ids_found=[],
            total_passenger_count=0,
            records=[],
            validation_errors=[f"File read error: {str(exc)}"],
            data_provenance="Upload validation failed: corrupted or unparseable file content.",
        )

    if not headers or not raw_rows:
        return HistoricalUploadResponse(
            filename=filename,
            status="INVALID_FILE",
            total_rows=0,
            valid_rows=0,
            invalid_rows_count=0,
            detected_columns=headers,
            column_mapping={},
            stop_ids_found=[],
            total_passenger_count=0,
            records=[],
            validation_errors=["Uploaded file contains no data rows or missing headers."],
            data_provenance="Upload validation failed: empty dataset.",
        )

    # Resolve column mappings
    detected_map, missing_cols = detect_column_mapping(headers)
    mapping = dict(detected_map)
    if custom_mapping:
        for k, v in custom_mapping.items():
            if v in headers:
                mapping[k] = v

    if len(mapping) < 3:
        err_msg = f"Missing required columns in '{filename}': {', '.join(missing_cols)}. Detected columns: {headers}"
        return HistoricalUploadResponse(
            filename=filename,
            status="INVALID_FILE",
            total_rows=len(raw_rows),
            valid_rows=0,
            invalid_rows_count=len(raw_rows),
            detected_columns=headers,
            column_mapping=mapping,
            stop_ids_found=[],
            total_passenger_count=0,
            records=[],
            validation_errors=[err_msg],
            data_provenance=f"Upload rejected: missing column mappings ({', '.join(missing_cols)}).",
        )

    time_key = mapping["time"]
    stop_key = mapping["stop_id"]
    pax_key = mapping["passengers"]

    valid_records: List[HistoricalRecord] = []
    validation_errors: List[str] = []
    stop_ids_set = set()
    total_passengers = 0

    for row_idx, row in enumerate(raw_rows, start=2):  # 1-indexed header is row 1
        raw_time = str(row.get(time_key, "")).strip()
        raw_stop = str(row.get(stop_key, "")).strip()
        raw_pax = str(row.get(pax_key, "")).strip()

        # Extract HH:MM if time has seconds or datetime format
        time_clean = raw_time
        if " " in time_clean:
            time_clean = time_clean.split(" ")[-1]
        if ":" in time_clean:
            parts = time_clean.split(":")
            if len(parts) >= 2:
                time_clean = f"{int(parts[0]):02d}:{int(parts[1]):02d}"

        try:
            valid_time = validate_hh_mm_string(time_clean)
        except Exception as exc:
            validation_errors.append(f"Row {row_idx}: Invalid time '{raw_time}' ({str(exc)})")
            continue

        if not raw_stop:
            validation_errors.append(f"Row {row_idx}: Stop ID is empty or whitespace.")
            continue

        try:
            pax_val = int(float(raw_pax))
            if pax_val < 0:
                validation_errors.append(f"Row {row_idx}: Negative passenger count '{raw_pax}' not permitted.")
                continue
        except Exception:
            validation_errors.append(f"Row {row_idx}: Non-numeric passenger count '{raw_pax}'.")
            continue

        rec = HistoricalRecord(time=valid_time, stop_id=raw_stop, passengers=pax_val)
        valid_records.append(rec)
        stop_ids_set.add(raw_stop)
        total_passengers += pax_val

    status = "SUCCESS" if not validation_errors else ("PARTIAL_SUCCESS" if valid_records else "INVALID_FILE")
    provenance = (
        f"Verified historical dataset '{filename}': {len(valid_records)} valid records, "
        f"{len(validation_errors)} rejected rows, {total_passengers:,} total historical passengers across {len(stop_ids_set)} stops."
    )

    return HistoricalUploadResponse(
        filename=filename,
        status=status,
        total_rows=len(raw_rows),
        valid_rows=len(valid_records),
        invalid_rows_count=len(validation_errors),
        detected_columns=headers,
        column_mapping=mapping,
        stop_ids_found=sorted(list(stop_ids_set)),
        total_passenger_count=total_passengers,
        records=valid_records,
        validation_errors=validation_errors[:20],  # cap at first 20 errors to prevent bloated payloads
        data_provenance=provenance,
    )


def generate_sample_historical_csv() -> str:
    """Generates standard CSV content representing a previous temple festival closing night."""
    rows = [
        "time,stop_id,passengers",
        # 21:00 - 21:15
        "21:00,STOP_MAIN,3500",
        "21:00,STOP_PERIPHERAL,20",
        "21:00,STOP_EAST_GATE,380",
        # 21:15 - 21:30
        "21:15,STOP_MAIN,6500",
        "21:15,STOP_PERIPHERAL,35",
        "21:15,STOP_EAST_GATE,710",
        # 21:30 - 21:45 (Peak egress)
        "21:30,STOP_MAIN,8100",
        "21:30,STOP_PERIPHERAL,45",
        "21:30,STOP_EAST_GATE,850",
        # 21:45 - 22:00
        "21:45,STOP_MAIN,6200",
        "21:45,STOP_PERIPHERAL,30",
        "21:45,STOP_EAST_GATE,650",
        # 22:00 - 22:15
        "22:00,STOP_MAIN,3400",
        "22:00,STOP_PERIPHERAL,20",
        "22:00,STOP_EAST_GATE,360",
        # 22:15 - 22:30
        "22:15,STOP_MAIN,1600",
        "22:15,STOP_PERIPHERAL,10",
        "22:15,STOP_EAST_GATE,170",
        # 22:30 - 22:45
        "22:30,STOP_MAIN,800",
        "22:30,STOP_PERIPHERAL,6",
        "22:30,STOP_EAST_GATE,70",
        # 22:45 - 23:00
        "22:45,STOP_MAIN,500",
        "22:45,STOP_PERIPHERAL,5",
        "22:45,STOP_EAST_GATE,40",
    ]
    return "\n".join(rows) + "\n"


def generate_sample_historical_excel() -> bytes:
    """Generates standard Excel (.xlsx) workbook bytes representing synthetic previous festival passenger records."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Festival Historical Crowds"

    headers = ["time", "stop_id", "passengers", "session_label", "notes"]
    ws.append(headers)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="1E3A8A", end_color="1E3A8A", fill_type="solid")

    for col_num, _ in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")

    sample_rows = [
        ["21:00", "STOP_MAIN", 3500, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:00", "STOP_PERIPHERAL", 20, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:00", "STOP_EAST_GATE", 380, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:15", "STOP_MAIN", 6500, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:15", "STOP_PERIPHERAL", 35, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:15", "STOP_EAST_GATE", 710, "Maha Deepam Festival 2025", "Synthetic demo reference observation"],
        ["21:30", "STOP_MAIN", 8100, "Maha Deepam Festival 2025", "Peak temple ceremony conclusion surge"],
        ["21:30", "STOP_PERIPHERAL", 45, "Maha Deepam Festival 2025", "Peak temple ceremony conclusion surge"],
        ["21:30", "STOP_EAST_GATE", 850, "Maha Deepam Festival 2025", "Peak temple ceremony conclusion surge"],
        ["21:45", "STOP_MAIN", 6200, "Maha Deepam Festival 2025", "Post-peak outbound egress"],
        ["21:45", "STOP_PERIPHERAL", 30, "Maha Deepam Festival 2025", "Post-peak outbound egress"],
        ["21:45", "STOP_EAST_GATE", 650, "Maha Deepam Festival 2025", "Post-peak outbound egress"],
        ["22:00", "STOP_MAIN", 3400, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:00", "STOP_PERIPHERAL", 20, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:00", "STOP_EAST_GATE", 360, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:15", "STOP_MAIN", 1600, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:15", "STOP_PERIPHERAL", 10, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:15", "STOP_EAST_GATE", 170, "Maha Deepam Festival 2025", "Tapering egress"],
        ["22:30", "STOP_MAIN", 800, "Maha Deepam Festival 2025", "Late night clearance"],
        ["22:30", "STOP_PERIPHERAL", 6, "Maha Deepam Festival 2025", "Late night clearance"],
        ["22:30", "STOP_EAST_GATE", 70, "Maha Deepam Festival 2025", "Late night clearance"],
        ["22:45", "STOP_MAIN", 500, "Maha Deepam Festival 2025", "Residual terminal clearance"],
        ["22:45", "STOP_PERIPHERAL", 5, "Maha Deepam Festival 2025", "Residual terminal clearance"],
        ["22:45", "STOP_EAST_GATE", 40, "Maha Deepam Festival 2025", "Residual terminal clearance"],
    ]

    for row in sample_rows:
        ws.append(row)

    ws.column_dimensions["A"].width = 12
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 28
    ws.column_dimensions["E"].width = 40

    out_stream = io.BytesIO()
    wb.save(out_stream)
    return out_stream.getvalue()


def calculate_actual_vs_predicted(
    historical_records: List[HistoricalRecord],
    predicted_intervals: List[Any],
) -> ActualVsPredictedSummary:
    """Calculates evaluation metrics comparing actual historical records with model predictions."""
    # Index actual records by (time, stop_id)
    actual_map: Dict[Tuple[str, str], int] = {}
    for r in historical_records:
        actual_map[(r.time, r.stop_id)] = actual_map.get((r.time, r.stop_id), 0) + r.passengers

    details: List[ActualVsPredictedInterval] = []
    abs_errors: List[float] = []
    pct_errors: List[float] = []

    for item in predicted_intervals:
        key = (item.start_time, item.stop_id)
        if key in actual_map:
            act = actual_map[key]
            pred = item.central_estimate
            diff = pred - act
            abs_err = abs(diff)
            pct_err = round((abs_err / max(1, act)) * 100.0, 1)

            details.append(
                ActualVsPredictedInterval(
                    interval=f"{item.start_time}-{item.end_time}",
                    stop_id=item.stop_id,
                    actual=act,
                    predicted=pred,
                    diff=diff,
                    abs_diff=abs_err,
                    percentage_error=pct_err,
                )
            )
            abs_errors.append(abs_err)
            pct_errors.append(pct_err)

    mae = round(sum(abs_errors) / max(1, len(abs_errors)), 1)
    mape = round(sum(pct_errors) / max(1, len(pct_errors)), 1)

    return ActualVsPredictedSummary(
        overall_mae=mae,
        overall_mape=mape,
        intervals_compared=len(details),
        interval_details=details,
    )
