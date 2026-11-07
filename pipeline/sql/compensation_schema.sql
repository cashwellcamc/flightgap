-- What passengers are legally owed (rules) vs. what airlines promise (commitments)
-- vs. what passengers actually got (reports). The gap between them is the product.

-- Statutory cash compensation by jurisdiction (EU261, UK261, Canada APPR, ...)
CREATE TABLE IF NOT EXISTS compensation_rules (
    jurisdiction      VARCHAR,   -- 'EU261', 'UK261', 'APPR_LARGE', 'APPR_SMALL'
    trigger           VARCHAR,   -- 'delay' | 'cancellation'
    min_distance_km   INTEGER,
    max_distance_km   INTEGER,
    min_delay_hours   DOUBLE,
    max_delay_hours   DOUBLE,
    amount            DOUBLE,
    currency          VARCHAR,
    controllable_only BOOLEAN,
    effective_from    DATE,
    notes             VARCHAR
);

-- What each US airline commits to on DOT's customer service dashboard.
CREATE TABLE IF NOT EXISTS carrier_commitments (
    carrier                VARCHAR,
    snapshot_date          DATE,
    meal_voucher           BOOLEAN,
    hotel_overnight        BOOLEAN,
    ground_transport       BOOLEAN,
    rebook_other_airline   BOOLEAN,
    cash_or_miles          BOOLEAN,
    est_meal_value_usd     DOUBLE,
    est_hotel_value_usd    DOUBLE,
    source_url             VARCHAR,
    verify_note            VARCHAR
);

-- Top-level passenger trip report.
CREATE TABLE IF NOT EXISTS passenger_reports (
    report_id             VARCHAR,
    title                 VARCHAR,   -- brief human label
    flight_date           DATE,
    carrier               VARCHAR,   -- booking/primary carrier
    flight_number         VARCHAR,
    origin                VARCHAR,
    dest                  VARCHAR,
    disruption            VARCHAR,   -- 'cancellation'|'delay'|'missed_connection'|'diversion'
    reason_given          VARCHAR,
    notice_hours          DOUBLE,
    planned_legs          INTEGER,
    actual_legs           INTEGER,
    final_arrival_delay_h DOUBLE,
    offered               VARCHAR,
    received_value_usd    DOUBLE,    -- cash-equivalent, discounted for restrictions
    days_to_resolve       INTEGER,
    complaints_filed      INTEGER,
    escalations           INTEGER,   -- steps beyond initial complaint
    created_at            TIMESTAMP DEFAULT current_timestamp
);

-- Per-leg detail: both planned and actual itinerary legs.
CREATE TABLE IF NOT EXISTS report_legs (
    report_id      VARCHAR,
    leg_seq        INTEGER,
    leg_type       VARCHAR,   -- 'planned' | 'actual'
    carrier        VARCHAR,
    flight_number  VARCHAR,
    origin         VARCHAR,
    dest           VARCHAR,
    sched_dep      VARCHAR,   -- ISO-8601 string; kept as text to avoid tz issues
    actual_dep     VARCHAR,
    delay_min      DOUBLE,
    disruption     VARCHAR,
    jurisdiction   VARCHAR,   -- 'US_DOT'|'EU261'|'UK261'|'APPR'|'NONE'
    distance_km    DOUBLE,
    notes          VARCHAR
);

-- Itemized compensation: both what was owed (estimates) and what was received.
CREATE TABLE IF NOT EXISTS report_compensation_items (
    report_id         VARCHAR,
    item_seq          INTEGER,
    carrier           VARCHAR,
    item_type         VARCHAR,   -- 'meal_voucher'|'hotel'|'rebooking'|'cash'|'credit'|'miles'
    description       VARCHAR,
    face_value_usd    DOUBLE,
    cash_equiv_usd    DOUBLE,    -- discounted for expiration/restrictions
    offered           BOOLEAN,
    received          BOOLEAN,
    restrictions      VARCHAR,   -- e.g. "expires 12 months, no cash value"
    owed_basis        VARCHAR,   -- citation: rule or commitment name
    is_owed_estimate  BOOLEAN    -- true = this is what should have been given; false = actual item
);
