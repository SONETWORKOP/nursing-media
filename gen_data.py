"""Generate placeholder data for edu-notes site.
Sem 1-7 x up to 5 subjects x 20 topics.
WARNING: running this OVERWRITES data/*.json (wipes real subject names).
Subject names + topic titles/content can be edited later in data/*.json
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")

SUBJECT_ICONS = ["\U0001f4d0", "\U0001f4d1", "\U0001f4d2", "\U0001f4da", "\U0001f4dc"]

site = {
    "course": "College Notes",
    "tagline": "Semester 1 to 6 \u2022 Notes in 3D Style",
    "owner": {
        "name": "Xit Jerry Pawan Kumar",
        "phone": "9928096797",
        "role": "Site Owner"
    },
    "theme": "3d-glass-dark",
    "semesters": [1, 2, 3, 4, 5, 6, 7]
}

with open(os.path.join(DATA, "site.json"), "w", encoding="utf-8") as f:
    json.dump(site, f, ensure_ascii=False, indent=2)

for sem in range(1, 8):
    subjects = []
    for s in range(1, 6):
        topics = [
            {
                "id": t,
                "title": f"Topic {t}",
                "content": "",   # <-- notes yahan bharo (HTML allowed)
                "pdf": "",       # <-- optional PDF link
                "video": ""      # <-- optional video link
            }
            for t in range(1, 21)
        ]
        subjects.append({
            "id": f"subject-{s}",
            "name": f"Subject {s}",
            "icon": SUBJECT_ICONS[(s - 1) % len(SUBJECT_ICONS)],
            "topics": topics
        })
    sem_data = {"sem": sem, "title": f"Semester {sem}", "subjects": subjects}
    with open(os.path.join(DATA, f"sem{sem}.json"), "w", encoding="utf-8") as f:
        json.dump(sem_data, f, ensure_ascii=False, indent=2)

print("Done: site.json + sem1..sem7.json")
print("Total slots: 7 sems x up to 5 subjects x 20 topics")
