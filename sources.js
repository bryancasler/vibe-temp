// The sources behind Dogs mode, ported from DC Goldens' Dog Weather
// (dcgoldens.org, src/lib/weather/sources.ts and source-labels.ts).
// SOURCES: every source a Dogs-mode line rests on, each graded strong,
// moderate, folklore or ours (the iem-archive and vibe-temp notes are
// reworded for Vibe Temp; the rest are as DC Goldens wrote them). NOTES: DC Goldens' method notes, as written
// there ("we" and "our" in them are DC Goldens). SHORT_LABELS: the short
// name each dog card shows for a source, linked to its url.
// methodology.html writes all of this out statically; nothing on it needs
// this file to render.
(function (root) {
  const SOURCES = [
    {
      "id": "nws-heat-index-equation",
      "title": "The Heat Index Equation",
      "publisher": "NOAA Weather Prediction Center",
      "year": 2022,
      "url": "https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml",
      "confidence": "strong",
      "note": "The formula we compute the heat index with, from air temperature and humidity. It is a scale for people, in shade."
    },
    {
      "id": "nws-heat-index-categories",
      "title": "Heat Index",
      "publisher": "National Weather Service, Amarillo",
      "year": 2026,
      "url": "https://www.weather.gov/ama/heatindex",
      "confidence": "strong",
      "note": "The Caution, Extreme Caution, Danger and Extreme Danger bands for people. An older NWS brochure starts Danger at 105°F instead of 103°F."
    },
    {
      "id": "nws-heat-index-sun",
      "title": "What is the heat index?",
      "publisher": "National Weather Service",
      "year": 2026,
      "url": "https://www.weather.gov/safety/heat-index",
      "confidence": "strong",
      "note": "The heat index assumes shade and light wind; full sun can add up to 15°F."
    },
    {
      "id": "dc-heat-plan-2026",
      "title": "2026 District of Columbia Heat Plan",
      "publisher": "DC Department of Human Services, HSEMA and the Interagency Council on Homelessness",
      "year": 2026,
      "url": "https://ready.dc.gov/documents/9a3d906caafa4204a0eafb27070cbdf5/about",
      "confidence": "strong",
      "note": "DC's Heat Alert starts at a forecast heat index of 95°F and its Extreme Heat Alert at 105°F. We say when a forecast reaches that level; only DC can issue an alert."
    },
    {
      "id": "beard-2024",
      "title": "Epidemiology of heat-related illness in dogs under UK emergency veterinary care in 2022",
      "publisher": "Beard, Hall, Bradbury, Carter, Gilbert and O'Neill, Veterinary Record (RVC VetCompass)",
      "year": 2024,
      "url": "https://www.rvc.ac.uk/research/research-centres-and-facilities/veterinary-epidemiology-economics-and-public-health/news/new-research-from-the-rvc-suggests-human-heat-health-alerts-could-help-prevent-heatstroke-in-dogs",
      "confidence": "strong",
      "note": "Five times as many dog heatstroke cases a day during the UK's human heat-health alerts. Measured against UK alerts, not DC's."
    },
    {
      "id": "hall-2020-sci-rep",
      "title": "Incidence and risk factors for heat-related illness (heatstroke) in UK dogs under primary veterinary care in 2016",
      "publisher": "Hall, Carter and O'Neill, Scientific Reports",
      "year": 2020,
      "url": "https://www.nature.com/articles/s41598-020-66015-8",
      "confidence": "strong",
      "note": "Golden retrievers had 2.67 times the odds of heat-related illness of Labradors (905,543 dogs); the authors suggest the thicker coat may be the tipping factor."
    },
    {
      "id": "hall-2020-animals",
      "title": "Dogs Don't Die Just in Hot Cars: Exertional Heat-Related Illness (Heatstroke) Is a Greater Threat to UK Dogs",
      "publisher": "Hall, Carter and O'Neill, Animals",
      "year": 2020,
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC7459873/",
      "confidence": "strong",
      "note": "Exercise was the most common trigger of heat-related illness in UK dogs (74.2% of events), and 67.5% of exercise cases with a known activity followed a walk. Goldens were not a significant breed in its models, so we cite it for walks, not for goldens."
    },
    {
      "id": "vetcompass-early-signs-2021",
      "title": "Recognising early signs of heatstroke in dogs can save lives",
      "publisher": "Royal Veterinary College VetCompass, reporting Hall et al., Scientific Reports",
      "year": 2021,
      "url": "https://www.rvc.ac.uk/vetcompass/news/recognising-early-signs-of-heatstroke-in-dogs-can-save-lives",
      "confidence": "strong",
      "note": "The early signs are breathing changes and lethargy, such as not wanting to exercise; 98% of dogs seen at that stage survived."
    },
    {
      "id": "chestovich-2022",
      "title": "Temperature Profiles of Sunlight-Exposed Surfaces in a Desert Climate: Determining the Risk for Pavement Burns",
      "publisher": "Chestovich, Saroukhanoff, Moujaes, Flores, Carroll and Saquib, Journal of Burn Care & Research",
      "year": 2022,
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10211493/",
      "confidence": "strong",
      "note": "Sunlit surfaces ran 36 to 56°F hotter than the same material in shade, measured at the same moment on a 120°F day, and sun plus heat, not air temperature alone, is what makes a surface dangerous. Measured in Las Vegas; the absolute numbers do not transfer to DC."
    },
    {
      "id": "wsu-hand-test-2017",
      "title": "Protect your pet's feet from heat, burns",
      "publisher": "Washington State University College of Veterinary Medicine",
      "year": 2017,
      "url": "https://archive.news.wsu.edu/press-release/2017/07/06/protect-pets-feet-from-heat/",
      "confidence": "folklore",
      "note": "The back-of-hand test at seven seconds. No study behind the count."
    },
    {
      "id": "akc-hand-test",
      "title": "How to Protect Dog Paws From Hot Pavement",
      "publisher": "American Kennel Club",
      "year": 2021,
      "url": "https://www.akc.org/expert-advice/health/dog-paws-hot-pavement/",
      "confidence": "folklore",
      "note": "The same test at ten seconds. No study behind the count."
    },
    {
      "id": "dogs-trust-hand-test",
      "title": "Caring for your dog during hot weather",
      "publisher": "Dogs Trust",
      "year": 2026,
      "url": "https://www.dogstrust.org.uk/dog-advice/life-with-your-dog/seasonal/hot-weather",
      "confidence": "folklore",
      "note": "The same test at five seconds. No study behind the count."
    },
    {
      "id": "berens-1970",
      "title": "Thermal contact burns from streets and highways",
      "publisher": "Berens, JAMA",
      "year": 1970,
      "url": "https://pubmed.ncbi.nlm.nih.gov/5536473/",
      "confidence": "strong",
      "note": "Where the popular pavement tables trace back to: a report on three people burned on Phoenix asphalt, about people rather than paws. Abstract and metadata verified; the full text is paywalled, so we do not claim what its inner pages hold."
    },
    {
      "id": "hall-2022-vet-sci",
      "title": "Risk Factors for Severe and Fatal Heat-Related Illness in UK Dogs: A VetCompass Study",
      "publisher": "Hall, Carter, Chico, Bradbury, Gentle, Barfield and O'Neill, Veterinary Sciences",
      "year": 2022,
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9144152/",
      "confidence": "strong",
      "note": "On the days UK dogs were seen for heat-related illness, the day's highest wet bulb globe temperature ranged from 3.3 to 23.1°C, a median of 16.9°C: dogs overheat on mild days. That is a heat-stress index read at shaded weather stations, which the authors say likely understate what a dog meets, not an air temperature. Read 2026-09-24."
    },
    {
      "id": "carter-hall-2018",
      "title": "Investigating factors affecting the body temperature of dogs competing in cross country (canicross) races in the UK",
      "publisher": "Carter and Hall, Journal of Thermal Biology",
      "year": 2018,
      "url": "https://pubmed.ncbi.nlm.nih.gov/29496012/",
      "confidence": "strong",
      "note": "108 dogs over 10 winter race days: at every race at least one dog finished with an ear temperature above 40.6°C (105°F). Hard running in harness, not a walk. Read 2026-09-24."
    },
    {
      "id": "hall-2024-thesis",
      "title": "Hot Dogs: Advancing the Epidemiology and Clinical Definition of Heat-Related Illness in UK Dogs",
      "publisher": "Emily J. Hall, PhD thesis, Nottingham Trent University",
      "year": 2024,
      "url": "https://irep.ntu.ac.uk/id/eprint/52075/",
      "confidence": "strong",
      "note": "Says advice on safe temperatures for exercising with dogs is lacking (p. 100), and puts the air at those canicross races at 8.8°C (48°F) on average. Coat colour and length made no significant difference once each dog was counted once. Read 2026-09-24."
    },
    {
      "id": "salonen-2020",
      "title": "Prevalence, comorbidity, and breed differences in canine anxiety in 13,700 Finnish pet dogs",
      "publisher": "Salonen et al., Scientific Reports",
      "year": 2020,
      "url": "https://www.nature.com/articles/s41598-020-59837-z",
      "confidence": "strong",
      "note": "Noise sensitivity affects 32% of dogs and grows with age, fear of thunder especially."
    },
    {
      "id": "nws-api",
      "title": "API Web Service",
      "publisher": "National Weather Service",
      "year": 2026,
      "url": "https://www.weather.gov/documentation/services-web-api",
      "confidence": "strong",
      "note": "Where the thunderstorm forecast comes from: the gridded forecast each Weather Service office keeps for its area, Baltimore/Washington for DC. Free and public domain. Read 2026-09-24."
    },
    {
      "id": "nws-pfm-spec",
      "title": "Point Forecast Matrices Product Specifications",
      "publisher": "National Weather Service",
      "year": 2020,
      "url": "https://www.weather.gov/media/notification/dir/PFM_Specifications.pdf",
      "confidence": "strong",
      "note": "What the Weather Service's forecast words mean: slight chance 20% or less, chance 30 to 50%, likely 60 to 70%, and 80 to 100% with no qualifier (Table 4). Read 2026-09-24."
    },
    {
      "id": "iem-archive",
      "title": "Iowa Environmental Mesonet",
      "publisher": "Iowa State University, Department of Agronomy",
      "year": 2026,
      "url": "https://mesonet.agron.iastate.edu/",
      "confidence": "strong",
      "note": "Keeps the history DC Goldens' storm comparison used: the Weather Service's archived point forecasts for Reagan National, from its Baltimore/Washington office, and the airport's hourly reports of thunder. The archive is theirs; the comparison is DC Goldens'. Read 2026-09-24."
    },
    {
      "id": "open-meteo-forecast-docs",
      "title": "Weather Forecast API documentation",
      "publisher": "Open-Meteo",
      "year": 2026,
      "url": "https://open-meteo.com/en/docs",
      "confidence": "strong",
      "note": "The forecast's weather codes: 95 and 97 are thunderstorms, and 96 and 99 (with hail) come only from models with a hail forecast, such as DWD ICON or UKMO. Read 2026-09-24."
    },
    {
      "id": "epa-aqi",
      "title": "AQI Basics",
      "publisher": "US EPA AirNow",
      "year": 2026,
      "url": "https://www.airnow.gov/aqi/aqi-basics/",
      "confidence": "strong",
      "note": "The six AQI categories, from Good to Hazardous. A scale for people."
    },
    {
      "id": "csu-pet-aqi-2026",
      "title": "Do you know how poor air quality affects pets? Learn through this adapted index",
      "publisher": "Colorado State University College of Veterinary Medicine and Biomedical Sciences",
      "year": 2026,
      "url": "https://cvmbs.source.colostate.edu/do-you-know-how-poor-air-quality-affects-pets-learn-through-this-adapted-index/",
      "confidence": "moderate",
      "note": "Dr. Colleen Duncan and colleagues adapted the EPA scale for pets, with advice for each band. A news story, not a peer-reviewed paper; paraphrased here, and their chart is theirs."
    },
    {
      "id": "merck-salt-toxicosis",
      "title": "Salt Toxicosis in Animals",
      "publisher": "Merck Veterinary Manual",
      "year": 2022,
      "url": "https://www.merckvetmanual.com/toxicology/salt-toxicosis/salt-toxicosis-in-animals",
      "confidence": "strong",
      "note": "In dogs the lethal dose of salt is about 4 g/kg, and signs can appear after 2 to 3 g/kg."
    },
    {
      "id": "aspca-ice-melt",
      "title": "Ice melts are health hazards (Toxicology Brief)",
      "publisher": "Hautekeete, ASPCA Animal Poison Control Center, in Veterinary Medicine",
      "year": 2000,
      "url": "https://www.aspcapro.org/sites/default/files/u-toxbrief_0200.pdf",
      "confidence": "strong",
      "note": "A dog that walked through ice melt should be bathed and watched for skin irritation; 4 g/kg of sodium chloride can be lethal."
    },
    {
      "id": "dc-code-8-1801",
      "title": "D.C. Code § 8-1801, Definitions",
      "publisher": "Council of the District of Columbia",
      "year": 2026,
      "url": "https://code.dccouncil.gov/us/dc/council/code/sections/8-1801",
      "confidence": "strong",
      "note": "Section (13): extreme weather means below 32°F or above 90°F. Air temperature; no wind chill."
    },
    {
      "id": "dc-code-8-1808",
      "title": "D.C. Code § 8-1808, Prohibited conduct",
      "publisher": "Council of the District of Columbia",
      "year": 2026,
      "url": "https://code.dccouncil.gov/us/dc/council/code/sections/8-1808",
      "confidence": "strong",
      "note": "Section (c)(1): no leaving an animal outdoors without a person or adequate shelter for more than 15 minutes in extreme weather, unless its age, condition and type let it withstand it. It does not limit walks."
    },
    {
      "id": "purdue-va-16-w",
      "title": "Temperature Requirements for Dogs (VA-16-W)",
      "publisher": "Jordan, Bauer, Stella and Croney, Purdue University Center for Animal Welfare Science",
      "year": 2016,
      "url": "https://www.extension.purdue.edu/extmedia/va/va-16-w.pdf",
      "confidence": "strong",
      "note": "Cold tolerance varies widely by coat: the lower critical temperature is below 0°C (32°F) for a husky and 15°C (59°F) for some short-haired dogs. It also gives, from the National Research Council, the range where a dog keeps its temperature without spending effort on it: 20 to 30°C (68 to 86°F). Housing numbers for dogs at rest, not on a walk."
    },
    {
      "id": "nws-wind-chill",
      "title": "Wind Chill Chart",
      "publisher": "National Weather Service",
      "year": 2026,
      "url": "https://www.weather.gov/safety/cold-wind-chill-chart",
      "confidence": "strong",
      "note": "The wind chill index works at the height of an adult's face and is based on a human face model."
    },
    {
      "id": "dc-winter-plan-fy26",
      "title": "District of Columbia Winter Plan, FY26",
      "publisher": "DC Interagency Council on Homelessness, with HSEMA",
      "year": 2025,
      "url": "https://ich.dc.gov/page/winter-plan",
      "confidence": "strong",
      "note": "DC's Extreme Cold Alert (once the Cold Weather Emergency) is called when the NWS forecasts a wind chill of 15°F or below, or 16 to 20°F with at least a 50% chance of rain, snow, freezing rain or sleet (§2.2). Its Cold Alert starts at a wind chill of 32°F, or 40°F with at least a 50% chance of precipitation (§2.1). Alerts for people; only DC can call one. Read 2026-09-24."
    },
    {
      "id": "vibe-temp",
      "title": "Vibe Temp",
      "publisher": "Bryan Casler",
      "year": 2025,
      "url": "https://github.com/bryancasler/vibe-temp",
      "confidence": "ours",
      "note": "Bryan's own model of how warm it feels to a person in the sun and in the shade, tuned by hand against how DC feels, with public code, and the touch-grass rule that picks the best time for a person to be outside. Not a published formula and not peer reviewed. It reads cloud from the direct-beam share of sunlight, a change first made for DC Goldens' Dog Weather."
    },
    {
      "id": "widorn-2024",
      "title": "A prospective study evaluating the correlation between local weather conditions, pollen counts and pruritus of dogs with atopic dermatitis",
      "publisher": "Widorn, Zabolotski and Mueller, Veterinary Dermatology",
      "year": 2024,
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11656670/",
      "confidence": "strong",
      "note": "Found no correlation between pollen counts and itch in allergic dogs, and questions whether rooftop pollen traps reflect a dog's exposure at ground level."
    },
    {
      "id": "open-meteo-air-quality-docs",
      "title": "Air Quality API documentation",
      "publisher": "Open-Meteo",
      "year": 2026,
      "url": "https://open-meteo.com/en/docs/air-quality-api",
      "confidence": "strong",
      "note": "Pollen is only available for Europe; for DC every pollen value comes back empty (checked live)."
    }
  ];

  const NOTES = [
    {
      "id": "pavement-trigger",
      "title": "The sunny-pavement hours are our line",
      "body": "We flag an hour as sunny pavement when it is daytime, the UV index is 3 or more and the air is 80°F or warmer. No study sets that line. It marks the hours when the combination researchers measured, direct sun on a hot day, is plausible, and it never produces a pavement temperature.",
      "ours": true,
      "sourceIds": [
        "chestovich-2022"
      ]
    },
    {
      "id": "walk-windows",
      "title": "Walk windows are our own combination",
      "body": "Every hour is rated by the weather alone, day and night; the clock plays no part. An hour is one to skip when the National Weather Service says thunderstorms are likely, when the heat index reaches DC's Heat Alert level (95°F), when a forecast wind chill reaches DC's Extreme Cold Alert level (15°F, or 20°F with at least a 50% chance of rain or snow), or when the AQI is 151 or more. It is one to take care in when thunderstorms are possible, the heat index is 80°F or more, the pavement is in sun, the AQI is 101 to 150, rain is 50% likely or more, or it is below freezing. The chart names each hour by its cause: Good for a walk; Getting warm, Getting cold, or Rain, storms or poor air, each with be cautious; and Too hot for Goldens, Too cold for Goldens, or Storms or unhealthy air, keep it short. The best windows are the longest stretches of the best hours left in the day. The 50% rain line is ours, and so is borrowing DC's heat and cold alert levels, which are set for people, for a golden; the others borrow the sources below.",
      "ours": true,
      "sourceIds": [
        "dc-heat-plan-2026",
        "dc-winter-plan-fy26",
        "nws-heat-index-categories",
        "epa-aqi",
        "chestovich-2022",
        "dc-code-8-1801",
        "nws-pfm-spec"
      ]
    },
    {
      "id": "sun-and-shade",
      "title": "In the sun and In the shade are our own estimate",
      "body": "The two lines on the chart, and the two cards with it, show how warm it is likely to feel to a person standing in full sun, and to the same person in shade. Between the hours the chart draws each line as a smooth curve that never rises above or dips below the hours on either side, so it shows no high or low the forecast doesn't have. They are our own estimate, not a published formula. Bryan, who runs DC Goldens, built it for Vibe Temp, his weather app, and set its numbers by hand until they matched how DC actually feels outside. The walk hours never read them. The sun line picks two times and nothing else: the paw-to-grass time for a golden, only among hours the walk rules already call good, and the touch-grass time for people.",
      "ours": true,
      "sourceIds": [
        "vibe-temp",
        "nws-heat-index-sun"
      ]
    },
    {
      "id": "touch-grass",
      "title": "The touch-grass time is Vibe Temp's rule for people",
      "body": "The leaf marks the best time for a person to get outside, by the rule Bryan wrote for Vibe Temp, his weather app, brought over as closely as this site allows. Vibe Temp reads its In the sun line every 15 minutes, on a straight line between the hourly values, rounded to a tenth of a degree, and looks only at daylight times from 65 to 75°F (18 to 24°C). Each scores 100, less 10 for every degree it sits from 70°F, and a time from 10am to 5pm scores 20 more. The best score on each day wins, and a tie keeps the earlier time. The 24-hour view shows the best in the next 24 hours, and the 7-day view one on each day. No walk rule applies to it: it is for people, and Vibe Temp has none.\n\nWhere ours differs from Vibe Temp's, each because this site's chart differs: the sun line it reads is ours, with the direct-beam change described under Sun and shade. Daylight runs from each day's sunrise to its sunset, to the minute, where Vibe Temp goes by the hour. It scores in degrees Fahrenheit even when the page shows Celsius, where Vibe Temp switches to 18 to 24°C. It only looks ahead from now, where Vibe Temp marks today's best even after it has passed. The 24-hour view shows one best in the next 24 hours, where Vibe Temp marks each calendar day's. Vibe Temp draws its sun line onto the shade line wherever the two are within 5% of each other, and its rule reads that drawn line; ours reads the sun line as it is. And the leaf sits on the smooth line the chart draws, which curves between the hours where the rule reads a straight one, so the leaf can sit a little off the reading it names: on DC's days in 2025, under half a degree nine times in ten, and never more than a degree and a half.",
      "ours": true,
      "sourceIds": [
        "vibe-temp"
      ]
    },
    {
      "id": "paw-to-grass",
      "title": "The paw-to-grass time is our own pick",
      "body": "The paw marks one time: the best time for a golden to get out on the grass. It sits on the chart's In the sun line, at the minute the line comes closest to 57°F (14°C), in daylight (from sunrise to sunset) and where our walk rules call the hours on either side of it good. The forecast gives one reading an hour, so a minute between two of them is read off the smooth line the chart draws through them: an estimate from the curve, no more exact than the two hours it joins. Anything from 45 to 64°F (7 to 18°C) can hold it, judged in whole degrees Fahrenheit whichever units the page shows, and a tie goes to the earlier minute. The 7-day view puts a paw on each day's own best time and names the week's best. When nothing in the next 24 hours (or the next 7 days, on the week view) fits, there is no paw, and we say why.\n\nThe range is our choice. No study sets one, and the researchers closest to the question say advice on safe temperatures for exercising dogs is missing. What the evidence does say points cooler than a person. A resting dog holds its temperature without effort from about 68 to 86°F (20 to 30°C), and a walk adds heat it mostly has to pant away. At UK canicross races where the air averaged 48°F (9°C), at least one running dog per race finished with an ear temperature above 105°F (40.6°C). And goldens had 2.67 times the odds of heat-related illness of Labradors. So we aimed 13°F below the 70°F that Vibe Temp aims for a person, stopped the range at 64°F, and let it reach further on the cool side than the warm side, because the evidence of harm for goldens is on the warm side.\n\nWe score the In the sun line, the warmer of our two, because a golden on open grass is usually in the sun. The UK study of dogs seen for heat-related illness read each day's weather at shaded weather stations, which its authors say likely understate what a dog meets; the canicross temperature above was measured on the course, out of the shade. Both lines estimate how it feels to a person; nobody has measured how a golden's coat takes the sun. The paw is a pleasant time for a walk, not a safe temperature and not a veterinary threshold: dogs in these studies overheated on mild days too.",
      "ours": true,
      "sourceIds": [
        "vibe-temp",
        "hall-2024-thesis",
        "purdue-va-16-w",
        "carter-hall-2018",
        "hall-2020-sci-rep",
        "hall-2022-vet-sci"
      ]
    },
    {
      "id": "homepage-alert",
      "title": "The homepage weather note is our shortlist",
      "body": "The homepage mentions the weather only when, between now and the end of tomorrow, it reaches something serious for people: a heat index at DC's Heat Alert level (95°F) or Extreme Heat Alert level (105°F), a forecast wind chill at DC's Extreme Cold Alert level (15°F, or 20°F with at least a 50% chance of rain or snow), freezing rain or drizzle, heavy snow, thunderstorms the National Weather Service calls likely, or an AQI of 151 or more. It reads DC's forecast from ZIP 20009 for everyone, and on an ordinary day it shows nothing at all. Which items make the list is our choice; each number on it is DC's or the EPA's, ice and heavy snow are the forecast's own weather codes, and storms are the National Weather Service's own word.",
      "ours": true,
      "sourceIds": [
        "dc-heat-plan-2026",
        "dc-winter-plan-fy26",
        "nws-wind-chill",
        "epa-aqi",
        "nws-pfm-spec"
      ]
    },
    {
      "id": "storm-source",
      "title": "Why storms come from the National Weather Service",
      "body": "The forecast model behind the rest of Dog Weather files DC's storm days under heavy showers: from January 2024 to September 2026 it never forecast an hour of thunder here, while Reagan National Airport recorded thunder on 119 days. So the storm line reads the National Weather Service's own forecast instead. Over May to September of 2025 and 2026, its Baltimore/Washington office gave at least a chance of thunderstorms a day ahead on 63 of the 69 days thunder was heard at the airport. It also gave a chance on about 40 days that stayed quiet there, which is what a 30 to 50% chance looks like, so we say possible, not coming. The comparison is ours, and small: one airport, two summers and nothing from the colder months, scored against the Weather Service's archived forecasts for that airport rather than the feed the site reads today.",
      "ours": false,
      "sourceIds": [
        "iem-archive",
        "open-meteo-forecast-docs",
        "nws-pfm-spec"
      ]
    },
    {
      "id": "no-pavement-number",
      "title": "Why there is no pavement temperature",
      "body": "The pavement tables that circulate trace back to a 1970 report on three people burned on Phoenix asphalt: a study of people, not paws. Nobody has measured what surface temperature burns a dog's paw, so we show where the sun is instead of a number. The back-of-hand test is a fine habit; the published advice says 5, 7 or 10 seconds, and none of those counts was tested.",
      "ours": false,
      "sourceIds": [
        "berens-1970",
        "chestovich-2022",
        "wsu-hand-test-2017",
        "akc-hand-test",
        "dogs-trust-hand-test"
      ]
    },
    {
      "id": "no-wind-chill",
      "title": "Why there is no wind chill",
      "body": "The wind chill index models wind at the height of an adult's face and is built on a human face. A golden's double coat is exactly what it leaves out, so we show air temperature and DC's legal line instead. We work it out in one place only: to tell when the forecast reaches DC's Extreme Cold Alert level, which the District writes in wind chill for people. The homepage note and the walk times' Too cold for Goldens both read that level, and we never print it. Borrowing a line set for people for a golden is our choice, as it is for heat. Wind does take some warmth off our In the shade estimate for a person, which is our own line, not the wind chill.",
      "ours": false,
      "sourceIds": [
        "nws-wind-chill",
        "dc-code-8-1801",
        "dc-winter-plan-fy26"
      ]
    },
    {
      "id": "no-pollen",
      "title": "Why there is no pollen count",
      "body": "Our weather source only has pollen for Europe, and the one study built to test pollen counts against itching in allergic dogs found no link. A golden walks with its nose in the grass; the count comes from a trap on a roof.",
      "ours": false,
      "sourceIds": [
        "open-meteo-air-quality-docs",
        "widorn-2024"
      ]
    }
  ];

  const SHORT_LABELS = {
    "nws-heat-index-equation": "NWS heat index equation",
    "nws-heat-index-categories": "NWS heat index bands",
    "nws-heat-index-sun": "NWS on sun and the heat index",
    "dc-heat-plan-2026": "DC Heat Plan 2026",
    "beard-2024": "Beard et al. 2024 (RVC)",
    "hall-2020-sci-rep": "Hall et al. 2020, Scientific Reports",
    "hall-2020-animals": "Hall et al. 2020, Animals",
    "vetcompass-early-signs-2021": "RVC VetCompass 2021",
    "chestovich-2022": "Chestovich et al. 2022",
    "wsu-hand-test-2017": "Washington State University",
    "akc-hand-test": "American Kennel Club",
    "dogs-trust-hand-test": "Dogs Trust",
    "berens-1970": "Berens 1970",
    "hall-2022-vet-sci": "Hall et al. 2022, Veterinary Sciences",
    "carter-hall-2018": "Carter and Hall 2018",
    "hall-2024-thesis": "Hall 2024 (thesis)",
    "salonen-2020": "Salonen et al. 2020",
    "nws-api": "National Weather Service forecast",
    "nws-pfm-spec": "NWS forecast wording",
    "iem-archive": "Iowa Environmental Mesonet",
    "open-meteo-forecast-docs": "Open-Meteo forecast docs",
    "epa-aqi": "EPA AirNow",
    "csu-pet-aqi-2026": "Colorado State University 2026",
    "merck-salt-toxicosis": "Merck Veterinary Manual",
    "aspca-ice-melt": "ASPCA Animal Poison Control",
    "dc-code-8-1801": "D.C. Code § 8-1801",
    "dc-code-8-1808": "D.C. Code § 8-1808",
    "purdue-va-16-w": "Purdue VA-16-W",
    "nws-wind-chill": "NWS wind chill chart",
    "dc-winter-plan-fy26": "DC Winter Plan FY26",
    "vibe-temp": "Vibe Temp (ours)",
    "widorn-2024": "Widorn et al. 2024",
    "open-meteo-air-quality-docs": "Open-Meteo air quality docs"
  };

  const VibeSources = { SOURCES, NOTES, SHORT_LABELS };
  root.VibeSources = VibeSources;
  if (typeof module === "object" && module.exports) module.exports = VibeSources;
})(typeof window !== "undefined" ? window : globalThis);
