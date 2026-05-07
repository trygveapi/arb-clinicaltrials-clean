# arb-clinicaltrials-clean
Flattened, cached REST wrapper over the ClinicalTrials.gov v2 API. Normalizes the nested study schema into a flat record per trial with stable identifiers, normalized sponsor and condition fields, and indexed status and date columns for efficient filtering. Backed by a periodically refreshed mirror of the public dataset.
