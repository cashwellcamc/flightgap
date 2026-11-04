-- What passengers are legally owed (rules) vs. what airlines promise (commitments)
-- vs. what passengers actually got (reports). The gap between them is the product.

-- Statutory cash compensation by jurisdiction (EU261, UK261, Canada APPR, ...)
CREATE TABLE IF NOT EXISTS compensation_rules (
    jurisdiction      VARCHAR,   -- 'EU261', 'UK261', 'APPR_LARGE', 'APPR_SMALL'
    trigger           VARCHAR,   -- 'delay' | 'cancellation'
    min_distance_km   INTEGER,   -- inclusive lower bound (NULL = any)
    max_distance_km   INTEGER,   -- exclusive upper bound (NULL = no limit)
    min_delay_hours   DOUBLE,    -- arrival delay threshold
    max_delay_hours   DOUBLE,
    amount            DOUBLE,
    currency          VARCHAR,
    controllable_only BOOLEAN,   -- true = not owed for weather/"extraordinary" causes
    effective_from    DATE,
    notes             VARCHAR
);

-- What each US airline commits to on DOT's customer service dashboard,
-- snapshotted over time (commitments change).
CREATE TABLE IF NOT EXISTS carrier_commitments (
    carrier                VARCHAR,
    snapshot_date          DATE,
    meal_voucher           BOOLEAN,  -- controllable delay 3+ hrs
    hotel_overnight        BOOLEAN,  -- controllable overnight delay/cancel
    ground_transport       BOOLEAN,
    rebook_other_airline   BOOLEAN,
    cash_or_miles          BOOLEAN,
    est_meal_value_usd     DOUBLE,   -- our estimate, for "liability dodged" math
    est_hotel_value_usd    DOUBLE,
    source_url             VARCHAR
);

-- Crowdsourced: what actually happened to the passenger.
CREATE TABLE IF NOT EXISTS passenger_reports (
    report_id             VARCHAR,
    flight_date           DATE,
    carrier               VARCHAR,
    flight_number         VARCHAR,
    origin                VARCHAR,
    dest                  VARCHAR,
    disruption            VARCHAR,  -- 'cancelled' | 'delayed' | 'missed_connection' | 'diverted'
    reason_given          VARCHAR,  -- what staff told the passenger
    notice_hours          DOUBLE,   -- hours of notice before scheduled departure (0 = at airport)
    planned_legs          INTEGER,
    actual_legs           INTEGER,
    final_arrival_delay_h DOUBLE,
    offered               VARCHAR,  -- free text: vouchers, hotel, miles...
    received_value_usd    DOUBLE,
    days_to_resolve       INTEGER,
    complaints_filed      INTEGER,
    created_at            TIMESTAMP DEFAULT current_timestamp
);
