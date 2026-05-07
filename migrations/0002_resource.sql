CREATE TABLE IF NOT EXISTS studies (
    nct_id TEXT,
    brief_title TEXT,
    overall_status TEXT,
    phase TEXT,
    lead_sponsor TEXT,
    primary_condition TEXT,
    country TEXT,
    enrollment_count INTEGER,
    start_date TEXT,
    last_update_posted TEXT,
    PRIMARY KEY (nct_id)
);
CREATE INDEX IF NOT EXISTS idx_studies_overall_status ON studies(overall_status);
CREATE INDEX IF NOT EXISTS idx_studies_phase ON studies(phase);
CREATE INDEX IF NOT EXISTS idx_studies_lead_sponsor ON studies(lead_sponsor);
CREATE INDEX IF NOT EXISTS idx_studies_primary_condition ON studies(primary_condition);
CREATE INDEX IF NOT EXISTS idx_studies_country ON studies(country);
CREATE INDEX IF NOT EXISTS idx_studies_start_date ON studies(start_date);
CREATE INDEX IF NOT EXISTS idx_studies_last_update_posted ON studies(last_update_posted);
