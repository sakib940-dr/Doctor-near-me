# Doctor Prescription Module

This build adds the DentalMCQ-style prescription workflow to the Doctor module of Doctor Near Me.

## Database setup

If migrations `01` through `25` are already applied, run only:

```text
supabase/26_doctor_prescription_module.sql
```

Then import:

```text
supabase/data/dgda_drug_master_import.csv
```

into `public.drug_master` using the Supabase Table Editor CSV importer. The bundled normalized catalog contains **41,121 records**.

## Frontend

The Doctor dashboard now exposes `/doctor/prescriptions`. Confirmed/completed appointments also have a Prescription action that pre-fills patient and chamber context.

The medicine composer intentionally remains a single-entry four-row form: Medicine, Dose, meal instruction, and numeric duration. Adding a medicine moves it to the prescription list and clears the composer for the next medicine.

Medicine search displays `form + brand + strength` on the first line and `generic + company` on the second line. The selected prescription value is only the display name. Recent medicines are ranked before catalog results.

Dose and meal-instruction fields are editable. Common starter values are shown, and values actually used by the doctor are learned only when a prescription is saved, then returned as doctor-specific Recent suggestions.

C/C, H/O, O/E, Investigation and Treatment Plan use doctor-recent + common autocomplete. Search matches words/partial words anywhere in the phrase.

## PDF

The PDF renderer keeps Latin text in Helvetica and shapes Bengali through the browser's Noto Sans Bengali canvas renderer. Bengali danda (`।`, U+0964) and double danda (`॥`, U+0965) are treated as Bengali so they are not mis-rendered as a trailing Latin `d`.

Each medicine prints as two logical lines:

```text
1. TAB. Napa 500 mg
   1+0+1 — খাবারের ৩০ মিনিট পরে খাবেন। — 3 দিন
```

## Install/build

```bash
npm install
npm run build
```

`jspdf` was added to `package.json`. The uploaded project's old lockfile was already out of sync with its dependency list, so this handoff intentionally omits `package-lock.json`. Run `npm install` once in your connected environment to generate a fresh lockfile before using `npm ci`.
