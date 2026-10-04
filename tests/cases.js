// Synthetic test cases (Bible §20). Fictional patients only - no real patient data.
// Each case has:
//   vignette   what the evaluating nurse reads before dictating (blind to the expected fields)
//   dictation  reference transcripts per section, written the way speech recognition actually returns them
//              (missing punctuation, homophones such as "pause"/"wait"/"blush sugar", number words)
//   expected   the exact structured result, recorded independently
//   flagged    fields the engine must NOT fill silently (ambiguous → unresolved/conflict)
//   redFlags   red-flag ids that must fire once the expected record is populated

export const CASES = [
  {
    id: 'SC01', title: 'Bilateral gradual visual loss (cataract pattern)',
    vignette: 'Toby Daniels, 57-year-old male trader, hospital number UCH4567, phone 08031234567. BP 150/90, RBS 200 mg/dL, pulse 80, weight 85 kg. Known diabetic, not hypertensive. Foggy vision in both eyes, gradual, 1 year. No pain, no redness. Sees halos, worse at night, struggles in bright light. Mother had cataract. No previous eye surgery. VA RE 6/36 (pinhole 6/18), LE 6/60 (pinhole 6/24). Pupils black and round. For slit lamp and cataract grading, routine.',
    dictation: {
      A: 'patient name Toby Daniels patient ID UCH 4567 age 57 sex male occupation trader phone number 08031234567 blood pressure 150 over 90 RBS 200 mg/dl pulse 80 beats per minute weight 85 kg known diabetic not hypertensive chief complaint foggy vision in both eyes for one year',
      B: 'both eyes gradual onset for one year no pain no redness halos present worse at night difficulty with bright light family history of cataract yes no previous eye surgery',
      C: 'VA right eye 6/36 pinhole 6/18 left eye 6/60 pinhole 6/24 pupils black and round',
      E: 'referral slit lamp and cataract grading routine priority',
    },
    expected: { patientName: 'Toby Daniels', patientId: 'UCH4567', age: '57', sex: 'Male', occupation: 'Trader', phone: '08031234567', bp: '150/90', sugar: '200', sugarUnit: 'mg/dL', pulse: '80', weight: '85', dm: 'Yes', htn: 'No', complaint: 'Foggy vision in both eyes for 1 year', hazy: 'Yes', eye: 'Both (BE)', onset: 'Gradual', duration: '1 year', pain: 'No', redness: 'No', halos: 'Yes', night: 'Yes', bright: 'Yes', cataractFamily: 'Yes', surgery: 'No', vaRE: '6/36', vaPHRE: '6/18', vaLE: '6/60', vaPHLE: '6/24', pupils: 'Black and round', referral: 'Slit lamp and cataract grading', priority: 'Routine' },
    redFlags: [],
  },
  {
    id: 'SC02', title: 'Speech-recognition homophones and number words',
    vignette: 'Mrs Adunni Okafor, 63-year-old female, retired teacher. BP 140/85. Pulse 72. Weight 70 kg. FBS 6.5 mmol/L. Not diabetic. Complains of blurred vision in the left eye for 6 months.',
    dictation: {
      A: 'patient name is Mrs Adunni Okafor age sixty three female occupation retired teacher BP one forty over eighty five pause 72 wait 70 kilograms fasting blush sugar 6.5 mmol per litre not a known diabetic complains of blurred vision in the left eye for six months',
    },
    expected: { patientName: 'Mrs Adunni Okafor', age: '63', sex: 'Female', occupation: 'Retired teacher', bp: '140/85', pulse: '72', weight: '70', sugar: '6.5', sugarUnit: 'mmol/L', dm: 'No', complaint: 'Blurred vision in the left eye for 6 months', eye: 'Left (LE)', duration: '6 months' },
    redFlags: [],
  },
  {
    id: 'SC03', title: 'Chemical injury - emergency override',
    vignette: 'Musa Bello, 34-year-old male bricklayer. Cement splashed into the right eye 30 minutes ago. Severe pain, redness, tearing. VA right counting fingers at 1 metre, left 6/6.',
    dictation: {
      A: 'patient name Musa Bello age 34 male occupation bricklayer chief complaint cement splashed into the right eye',
      B: 'right eye chemical injury cement 30 minutes ago severe pain and redness tearing yes',
      C: 'visual acuity right eye counting fingers at 1 metre left eye 6/6',
    },
    expected: { patientName: 'Musa Bello', age: '34', sex: 'Male', occupation: 'Bricklayer', complaint: 'Cement splashed into the right eye', eye: 'Right (RE)', chemical: 'Yes', chemicalAgent: 'Cement', duration: '30 minutes', pain: 'Yes', painDetail: 'Severe', redness: 'Yes', tearing: 'Yes', vaRE: 'CF 1m', vaLE: '6/6' },
    redFlags: ['chemical'],
  },
  {
    id: 'SC04', title: 'Acute painful red eye with vomiting',
    vignette: 'Grace Eze, 68-year-old female. Sudden severe pain and redness in the left eye since this morning, headache and vomiting, sees halos. Left pupil mid-dilated. VA left hand movements, right 6/12. IOP left 52, right 16.',
    dictation: {
      A: 'patient name Grace Eze age 68 female',
      B: 'left eye sudden onset severe pain and redness since this morning with headache and vomiting halos present',
      C: 'VA right eye 6/12 left eye hand movements mid dilated pupil left IOP right 16 left 52',
    },
    expected: { patientName: 'Grace Eze', age: '68', sex: 'Female', eye: 'Left (LE)', onset: 'Sudden', pain: 'Yes', painDetail: 'Severe', redness: 'Yes', duration: 'Since this morning', headache: 'Yes', vomiting: 'Yes', halos: 'Yes', vaRE: '6/12', vaLE: 'HM', midDilated: 'Yes', iopRE: '16', iopLE: '52' },
    redFlags: ['angle'],
  },
  {
    id: 'SC05', title: 'Newborn with purulent discharge',
    vignette: 'Baby boy Chukwuemeka Obi, 2 weeks old. Mother reports thick yellow discharge from both eyes for 3 days. Swollen lids.',
    dictation: {
      A: 'patient name Chukwuemeka Obi age 2 weeks male chief complaint thick yellow discharge from both eyes for 3 days',
      B: 'both eyes purulent discharge yes for 3 days',
      C: 'lids swollen',
    },
    expected: { patientName: 'Chukwuemeka Obi', age: '2', ageUnit: 'weeks', sex: 'Male', complaint: 'Thick yellow discharge from both eyes for 3 days', eye: 'Both (BE)', duration: '3 days', discharge: 'Yes', dischargeDetail: 'Purulent', lids: 'Swollen' },
    redFlags: ['newborn'],
  },
  {
    id: 'SC06', title: 'Flashes, floaters and a curtain',
    vignette: 'Ibrahim Sule, 45-year-old male, high myope with glasses. Flashes and floaters in the right eye for 2 days, now a curtain coming down over vision. No pain. VA right 6/24, left 6/9.',
    dictation: {
      A: 'patient name Ibrahim Sule age 45 male',
      B: 'right eye flashes and floaters for 2 days now a curtain over the vision no pain wears glasses',
      C: 'VA right 6/24 left 6/9',
    },
    expected: { patientName: 'Ibrahim Sule', age: '45', sex: 'Male', eye: 'Right (RE)', flashes: 'Yes', floaters: 'Yes', duration: '2 days', curtain: 'Yes', pain: 'No', spectacles: 'Yes', vaRE: '6/24', vaLE: '6/9' },
    redFlags: ['curtain'],
  },
  {
    id: 'SC07', title: 'White pupil in a child',
    vignette: 'Aisha Lawal, 3-year-old girl. Mother noticed a white reflex in the left eye in photographs. VA not possible - uncooperative.',
    dictation: {
      A: 'patient name Aisha Lawal 3 years old girl complains of white reflex in the left eye in photographs',
      C: 'VA right eye not possible left eye not possible white pupil left eye yes',
    },
    expected: { patientName: 'Aisha Lawal', age: '3', sex: 'Female', complaint: 'White reflex in the left eye in photographs', eye: 'Left (LE)', vaRE: 'Not possible', vaLE: 'Not possible', whitePupil: 'Yes' },
    redFlags: ['whitePupil'],
  },
  {
    id: 'SC08', title: 'Ambiguous numbers must not be guessed',
    vignette: 'Test of safety rules: the nurse corrects herself on BP, gives pulse without number, gives weight in pounds.',
    dictation: {
      A: 'patient name Kemi Ade blood pressure 130 over 80 sorry 150 over 80 pulse not counted weight 150 pounds',
      C: 'IOP 18 and 21',
    },
    expected: { patientName: 'Kemi Ade', iopRE: '18', iopLE: '21' },
    flagged: ['bp', 'pulse', 'weight'],
    redFlags: [],
  },
  {
    id: 'SC09', title: 'Trauma with padded eye, reason unknown',
    vignette: 'Unknown male about 25 years, brought in by police with a padded right eye after a fight. Reason for the pad not known. Bleeding from the eye reported by escort.',
    dictation: {
      A: 'patient name unknown age 25 male',
      B: 'right eye trauma yes assaulted in a fight bleeding from the eye',
      C: 'eye padded reason for pad unknown',
    },
    expected: { patientName: 'Unknown', age: '25', sex: 'Male', eye: 'Right (RE)', trauma: 'Yes', traumaDetail: 'Assaulted in a fight', bleeding: 'Yes', paddedEye: 'Yes', padReason: 'Unknown' },
    redFlags: ['penetrating', 'pad'],
  },
  {
    id: 'SC10', title: 'Allergic conjunctivitis - routine',
    vignette: 'Tunde Ajayi, 19-year-old male student. Itching, redness and watering in both eyes for 2 weeks. No discharge, no pain. VA 6/6 both eyes. Health education on not rubbing eyes; referred to general clinic.',
    dictation: {
      A: 'patient name Tunde Ajayi age 19 male student chief complaint itching and redness of both eyes for 2 weeks',
      B: 'both eyes itching yes redness yes watering yes no discharge no pain',
      C: 'VA 6/6 both eyes',
      E: 'health education advised not to rub the eyes referred to general clinic routine priority',
    },
    expected: { patientName: 'Tunde Ajayi', age: '19', sex: 'Male', complaint: 'Itching and redness of both eyes for 2 weeks', eye: 'Both (BE)', duration: '2 weeks', itching: 'Yes', redness: 'Yes', tearing: 'Yes', discharge: 'No', pain: 'No', vaRE: '6/6', vaLE: '6/6', education: 'Advised not to rub the eyes', referral: 'General clinic', priority: 'Routine' },
    redFlags: [],
  },
  {
    id: 'SC11', title: 'Dilation documented with time',
    vignette: 'Plan section only: tropicamide 1% instilled at 10:30 am, dilated for doctor, RBS sent, referred to retina clinic, urgent.',
    dictation: {
      E: 'drops instilled tropicamide 1% at 10:30 am dilated for doctor investigations RBS sent referred to retina clinic urgent priority',
    },
    expected: { dropsGiven: 'Tropicamide 1%', dropsTime: '10:30', dilated: 'Yes', dilationAgent: 'Tropicamide 1%', investigations: 'RBS sent', referral: 'Retina clinic', priority: 'Urgent' },
    redFlags: [],
  },
  {
    id: 'SC12', title: 'Sudden painless loss of vision',
    vignette: 'Bose Adewale, 72-year-old female, hypertensive. Sudden painless loss of vision in the right eye this morning. VA right perception of light, left 6/9.',
    dictation: {
      A: 'patient name Bose Adewale age 72 female known hypertensive',
      B: 'right eye sudden painless loss of vision no pain',
      C: 'VA right eye perception of light left eye 6/9',
    },
    expected: { patientName: 'Bose Adewale', age: '72', sex: 'Female', htn: 'Yes', eye: 'Right (RE)', suddenLoss: 'Yes', pain: 'No', vaRE: 'PL', vaLE: '6/9' },
    redFlags: ['suddenLoss'],
  },
];
