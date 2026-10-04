// Held-out synthetic cases: phrased differently from tests/cases.js and NOT used while writing the
// extraction rules. Their first-run score is recorded in the README as the honest baseline;
// later fixes must not be tuned case-by-case against this file (add new held-out cases instead).

export const HELDOUT = [
  {
    id: 'HO01', title: 'Conversational biodata, label after value',
    dictation: { A: 'this is Funmilayo Bakare she is 48 years old female her hospital number is OAU 3321 she works as a hairdresser her BP is 160/100 her pulse rate is 88 she is hypertensive but not diabetic she came with redness of the right eye' },
    expected: { patientName: 'Funmilayo Bakare', age: '48', sex: 'Female', patientId: 'OAU3321', occupation: 'Hairdresser', bp: '160/100', pulse: '88', htn: 'Yes', dm: 'No', complaint: 'Redness of the right eye', eye: 'Right (RE)' },
  },
  {
    id: 'HO02', title: 'Terse vitals with colons',
    dictation: { A: 'Name: Peter Okon. Age: 52. Sex: M. BP: 128/76 mmHg. Pulse: 64 bpm. Weight: 92kg. RBS: 7.8 mmol/L.' },
    expected: { patientName: 'Peter Okon', age: '52', sex: 'Male', bp: '128/76', pulse: '64', weight: '92', sugar: '7.8', sugarUnit: 'mmol/L' },
  },
  {
    id: 'HO03', title: 'History with denials phrased as "denies"',
    dictation: { B: 'left eye affected onset was sudden duration 3 days patient denies trauma denies discharge reports photophobia and tearing eye pain present moderate' },
    expected: { eye: 'Left (LE)', onset: 'Sudden', duration: '3 days', trauma: 'No', discharge: 'No', photophobia: 'Yes', tearing: 'Yes', pain: 'Yes', painDetail: 'Moderate' },
  },
  {
    id: 'HO04', title: 'VA with RE/LE abbreviations and IOP units',
    dictation: { C: 'visual acuity RE 6/18 LE 6/9 near N8 IOP RE 24 mmHg LE 22 mmHg cornea hazy conjunctiva injected' },
    expected: { vaRE: '6/18', vaLE: '6/9', nearVA: 'N8', iopRE: '24', iopLE: '22', cornea: 'Hazy', conjunctiva: 'Injected' },
  },
  {
    id: 'HO05', title: 'Plan dictated as a sentence',
    dictation: { E: 'plan refer to glaucoma clinic priority urgent investigations visual field and OCT health education on drug compliance' },
    expected: { referral: 'Glaucoma clinic', priority: 'Urgent', investigations: 'Visual field and OCT', education: 'On drug compliance' },
  },
  {
    id: 'HO06', title: 'Cataract questions answered yes/no',
    dictation: { B: 'cloudy vision yes glare yes worse at night no bright light difficulty yes family history of cataract no previous eye surgery yes right eye cataract surgery 2019' },
    expected: { hazy: 'Yes', halos: 'Yes', night: 'No', bright: 'Yes', cataractFamily: 'No', surgery: 'Yes', surgeryDetail: 'Right eye cataract surgery 2019' },
  },
  {
    id: 'HO07', title: 'Child with words for numbers',
    dictation: { A: 'patient name Ifeoluwa Adeyemi age seven years sex female weight twenty two kilograms complaint squint noticed by mother for two years' },
    expected: { patientName: 'Ifeoluwa Adeyemi', age: '7', sex: 'Female', weight: '22', complaint: 'Squint noticed by mother for 2 years', duration: '2 years' },
  },
  {
    id: 'HO08', title: 'Penetrating injury dictated quickly',
    dictation: { B: 'right eye penetrating injury with a nail while working this morning bleeding yes no chemical', C: 'VA right hand movement left 6/6 eye not padded' },
    expected: { eye: 'Right (RE)', penetrating: 'Yes', bleeding: 'Yes', chemical: 'No', vaRE: 'HM', vaLE: '6/6', paddedEye: 'No' },
    redFlags: ['penetrating'],
  },
];
