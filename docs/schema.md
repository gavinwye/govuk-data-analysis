# Data model

Principle: **raw observation is immutable; interpretation is a separate, reviewable mapping.**
What a form asked is recorded exactly as scraped. What we say it means (the
canonical data element) is a different table that a human can correct without
re-scraping.

```
service 1──* scrape_run 1──* page 1──* field *──* data_element
                                                  (via field_element)
```

## service
| column | notes |
|---|---|
| id | slug of the name |
| name, organisation, topic | from `govuk-services.json` |
| start_url | the service-list or gov.uk start page |
| host | hostname after "Start now" (the service's own domain) |
| requires_login | true once a run hits One Login / Government Gateway |

## scrape_run
One row per attempt, so runs are comparable over time.

| column | notes |
|---|---|
| id, service_id, scraped_at | |
| scraper_version | git SHA of the scraper |
| stop_reason | `end-page`, `auth`, `contact-form (not submitted)`, `blocked: <label>`, `no-continue`, `no-change`, `validation-error: …`, `max-pages`, `error` |
| coverage | see below |

### coverage
"Not reached" must never read as "not collected".

| value | meaning |
|---|---|
| `complete` | reached check-your-answers / confirmation |
| `partial` | stopped early; later pages unseen |
| `blocked-auth` | needs One Login / Government Gateway |
| `blocked-contact-form` | reached the contact-details page; recorded, not submitted |
| `no-form` | not a transactional service (guidance hub, result page) |

## page
| column | notes |
|---|---|
| id, run_id, position | order visited |
| url_path, heading | |
| kind | `question`, `choice`, `contact`, `check-answers`, `confirmation`, `auth` |

## field (immutable, as scraped)
| column | notes |
|---|---|
| id, page_id, position | |
| label | exactly as shown, with "(optional)" removed |
| hint | hint text if present |
| input_type | `text`, `number`, `email`, `tel`, `date`, `radio`, `checkbox`, `select`, `textarea`, `file` |
| required | false only if the label says "(optional)" |
| options | for radio, checkbox and select: the list of option labels. Answers can themselves be sensitive (health, benefits, immigration status) |
| conditional_on | optional: `{field_id, option}` when the field only appears after an answer |

## data_element (our controlled vocabulary)
| column | notes |
|---|---|
| id | e.g. `date_of_birth`, `postcode`, `ni_number`, `bank_sort_code` |
| name, description | |
| category | `identity`, `contact`, `location`, `financial`, `health`, `employment`, `eligibility`, `credentials`, `consent` |
| is_personal_data | boolean |
| is_special_category | boolean (UK GDPR Art. 9: health, ethnicity, etc.) |

## field_element (the interpretation)
| column | notes |
|---|---|
| field_id, element_id | |
| method | `rule`, `llm`, `human` |
| confidence | 0–1 |
| reviewed_by, reviewed_at | set when a human confirms or corrects |

Unmapped fields are valid and expected: they form the review queue.

## Overlap analysis
Computed on `data_element`, never on label strings:

```sql
select element_id, count(distinct service_id) as services
from field_element join field ... join page ... join scrape_run ...
where run is the latest per service
group by element_id
order by services desc;
```

## Storage
Start with one JSON file per run (the CLI already writes these). Move to
Supabase tables once the element vocabulary has settled after 20–30 real runs.
