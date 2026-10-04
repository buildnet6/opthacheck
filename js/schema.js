// OphthaCheck field schema - the clerking sheet as the application's data model (Bible §5).
// Every field declares: section, group, label, type, unit, spoken aliases (destination cues, never values),
// and completeness requirement. Aliases are regex sources matched case-insensitively on word boundaries.
// Alias forms:  'regex'  |  { re:'regex', val:'value' }  (a phrase that carries its own value)
//               { re:'regex', local:true }  (only active while dictating this field's own section)

export const VERSION = '0.7.0';

export const TRI = ['Not assessed', 'Yes', 'No'];
export const NA = 'Not assessed';

export const SECTIONS = [
  { id: 'A', short: 'Biodata', title: 'Biodata & vitals', dictate: true, notes: 'nurseNotes' },
  { id: 'B', short: 'History', title: 'History of presenting complaint', dictate: true, notes: 'historyNotes' },
  { id: 'C', short: 'Exam', title: 'Nursing examination', dictate: true, notes: 'examNotes', banner: 'Check visual acuity before touching the eye or instilling drops.' },
  { id: 'D', short: 'Red flags', title: 'Red flags', dictate: false },
  { id: 'E', short: 'Plan', title: 'Nursing action & plan', dictate: true, notes: 'nurseNotes' },
];

const DIABETIC = '(?:known\\s+(?:to\\s+be\\s+)?(?:a\\s+)?)?(?:diabetic|diabetes(?:\\s+mellitus)?|dm)';
const HYPERTENSIVE = '(?:known\\s+(?:to\\s+be\\s+)?(?:a\\s+)?)?(?:hypertensive|hypertension|htn|high\\s+blood\\s+pressure)';

export const FIELDS = [
  // ── A. Biodata & vitals ─────────────────────────────────────────────
  { id: 'patientName', sec: 'A', group: 'Patient', label: 'Patient name', type: 'name', req: 'critical',
    aliases: ["patient(?:['’]?s)?\\s+name", 'name\\s+of\\s+(?:the\\s+)?patient', 'full\\s+name', 'name'] },
  { id: 'patientId', sec: 'A', group: 'Patient', label: 'Patient ID / Hospital No.', type: 'code', req: 'critical',
    aliases: ['patient\\s*(?:id|i\\.?\\s?d\\.?|number|no\\.?)', 'hospital\\s+(?:number|no\\.?|id)', 'folder\\s+(?:number|no\\.?)', 'card\\s+(?:number|no\\.?)', 'id\\s+number', 'mrn', 'registration\\s+(?:number|no\\.?)'] },
  { id: 'age', sec: 'A', group: 'Patient', label: 'Age', type: 'age', req: 'critical', companion: 'ageUnit',
    aliases: ['age', 'aged', 'patient\\s+h(?=\\s*(?:is\\s+)?\\d)'] },
  { id: 'ageUnit', sec: 'A', group: 'Patient', label: 'Age unit', type: 'select', options: ['years', 'months', 'weeks', 'days'], hidden: true, aliases: [] },
  { id: 'sex', sec: 'A', group: 'Patient', label: 'Sex', type: 'select', req: 'critical', options: ['', 'Male', 'Female'],
    synonyms: { Male: ['male', 'man', 'boy', 'gentleman', 'm'], Female: ['female', 'woman', 'girl', 'lady', 'f'] },
    aliases: ['sex', 'gender'] },
  { id: 'occupation', sec: 'A', group: 'Patient', label: 'Occupation', type: 'text',
    aliases: ['occupation', 'works?\\s+as', 'profession', 'job'] },
  { id: 'phone', sec: 'A', group: 'Patient', label: 'Phone', type: 'phone', req: 'recommended',
    aliases: ['phone(?:\\s+number)?', 'telephone(?:\\s+number)?', 'mobile(?:\\s+number)?', 'contact(?:\\s+number)?', 'gsm(?:\\s+number)?'] },
  { id: 'bp', sec: 'A', group: 'Vitals', label: 'Blood pressure', type: 'bp', unit: 'mmHg', req: 'recommended', placeholder: '150/90',
    aliases: ['blood\\s+pressure', 'bp', 'b\\.?\\s?p\\.?'] },
  { id: 'sugarType', sec: 'A', group: 'Vitals', label: 'Sugar test', type: 'select', options: ['RBS', 'FBS'], hidden: true, aliases: [] },
  { id: 'sugar', sec: 'A', group: 'Vitals', label: 'Blood sugar', type: 'sugar', companion: 'sugarUnit', placeholder: '200',
    aliases: ['rbs', 'fbs', 'r\\.?\\s?b\\.?\\s?s\\.?', 'f\\.?\\s?b\\.?\\s?s\\.?', '(?:random|fasting)\\s+(?:blood|blush|blot)\\s+(?:sugar|glucose)', '(?:random|fasting)\\s+sugar', 'blood\\s+(?:sugar|glucose)', 'blush\\s+sugar', 'sugar', 'glucose'] },
  { id: 'sugarUnit', sec: 'A', group: 'Vitals', label: 'Sugar unit', type: 'select', options: ['mg/dL', 'mmol/L'], hidden: true, aliases: [] },
  { id: 'pulse', sec: 'A', group: 'Vitals', label: 'Pulse', type: 'pulse', unit: 'BPM', placeholder: '80',
    aliases: ['pulse(?:\\s+rate)?', 'heart\\s+rate', 'pause(?=\\s*(?:is\\s+|of\\s+)?\\d)', 'pulls(?=\\s*(?:is\\s+)?\\d)'] },
  { id: 'weight', sec: 'A', group: 'Vitals', label: 'Weight', type: 'weight', unit: 'kg', placeholder: '70',
    aliases: ['weight', 'weighs', 'wait(?=\\s*(?:is\\s+|of\\s+)?\\d)', 'weigh(?=\\s*(?:is\\s+)?\\d)'] },
  { id: 'dm', sec: 'A', group: 'Comorbidity', label: 'Known diabetes (DM)', type: 'tri', req: 'recommended',
    aliases: [{ re: 'non[- ]?diabetic', val: 'No' }, DIABETIC] },
  { id: 'htn', sec: 'A', group: 'Comorbidity', label: 'Known hypertension (HTN)', type: 'tri', req: 'recommended',
    aliases: [{ re: 'non[- ]?hypertensive', val: 'No' }, { re: 'normotensive', val: 'No' }, HYPERTENSIVE] },
  { id: 'otherComorbid', sec: 'A', group: 'Comorbidity', label: 'Other comorbidity', type: 'text',
    aliases: ['other\\s+(?:medical\\s+)?conditions?', 'comorbidit(?:y|ies)', 'also\\s+has'] },
  { id: 'complaint', sec: 'A', group: 'Complaint', label: 'Chief complaint', type: 'text', req: 'critical', wide: true,
    aliases: ['(?:patient(?:[’\']s)?\\s+)?chief\\s+complaints?', 'presenting\\s+complaints?', 'main\\s+complaints?', 'complaints?', 'complain(?:s|ing|ed)?\\s+of', 'c\\/o', 'present(?:ed|s|ing)\\s+with', 'came\\s+(?:in\\s+)?with', 'reason\\s+for\\s+(?:the\\s+)?visit'] },

  // ── B. History of presenting complaint ──────────────────────────────
  { id: 'eye', sec: 'B', group: 'Presentation', label: 'Which eye', type: 'select', req: 'critical',
    options: ['Not assessed', 'Right (RE)', 'Left (LE)', 'Both (BE)'],
    synonyms: { 'Right (RE)': ['right', 'right eye', 're', 'od'], 'Left (LE)': ['left', 'left eye', 'le', 'os'], 'Both (BE)': ['both', 'both eyes', 'be', 'bilateral', 'ou', 'each eye'] },
    aliases: ['which\\s+eye', 'affected\\s+eye', 'eyes?\\s+affected', 'eyes?\\s+involved', 'laterality',
      { re: '(?:(?:both|the\\s+two)\\s+eyes|bilateral(?:ly)?|both\\s+sides)(?:\\s+(?:is\\s+|was\\s+)?(?:affected|involved))?', val: 'Both (BE)', notIn: 'C' },
      { re: '(?:(?:the\\s+)?right\\s+eye)(?:\\s+(?:is\\s+|was\\s+)?(?:affected|involved))?', val: 'Right (RE)', notIn: 'C' },
      { re: '(?:(?:the\\s+)?left\\s+eye)(?:\\s+(?:is\\s+|was\\s+)?(?:affected|involved))?', val: 'Left (LE)', notIn: 'C' }] },
  { id: 'onset', sec: 'B', group: 'Presentation', label: 'Onset', type: 'text', req: 'recommended', placeholder: 'Sudden / gradual',
    aliases: ['onset', { re: '(?:sudden|acute|abrupt)(?:\\s+onset)?(?!\\s+(?:painless\\s+)?(?:loss|visual\\s+loss|vision\\s+loss))', val: 'Sudden' }, { re: '(?:gradual|insidious|slow|progressive)(?:\\s+onset)?', val: 'Gradual' }] },
  { id: 'duration', sec: 'B', group: 'Presentation', label: 'Duration', type: 'duration', req: 'recommended', placeholder: 'e.g. 2 weeks',
    aliases: ['duration', 'how\\s+long', 'started'] },
  { id: 'nature', sec: 'B', group: 'Presentation', label: 'Nature / main symptom', type: 'text', wide: true,
    aliases: ['nature(?:\\s+of\\s+(?:the\\s+)?(?:complaint|problem|symptoms?))?', 'main\\s+symptom', 'symptoms?(?=\\s*(?:is|are|:))',
      { re: 'complain(?:s|ing|ed)?\\s+of', local: true }, { re: 'c\\/o', local: true }, { re: 'present(?:ed|s|ing)\\s+with', local: true }] },
  { id: 'pain', sec: 'B', group: 'Symptoms', label: 'Pain', type: 'tri', req: 'recommended', detail: 'painDetail',
    aliases: ['(?:eye\\s+)?pain(?:ful)?', 'aching', 'ache'] },
  { id: 'painDetail', sec: 'B', group: 'Symptoms', label: 'Pain severity / character', type: 'text', placeholder: 'e.g. severe, 8/10',
    aliases: ['pain\\s+(?:score|severity|scale)', 'severity\\s+of\\s+(?:the\\s+)?pain'] },
  { id: 'redness', sec: 'B', group: 'Symptoms', label: 'Redness', type: 'tri', aliases: ['redness', 'red\\s+eyes?'] },
  { id: 'itching', sec: 'B', group: 'Symptoms', label: 'Itching', type: 'tri', aliases: ['itch(?:ing|y|iness)?'] },
  { id: 'tearing', sec: 'B', group: 'Symptoms', label: 'Tearing / watering', type: 'tri', aliases: ['tearing', 'watering', 'watery\\s+eyes?', 'lacrimation', 'tears'] },
  { id: 'discharge', sec: 'B', group: 'Symptoms', label: 'Discharge', type: 'tri', detail: 'dischargeDetail', aliases: ['discharge'] },
  { id: 'dischargeDetail', sec: 'B', group: 'Symptoms', label: 'Discharge character', type: 'text', placeholder: 'e.g. purulent, watery', aliases: ['discharge\\s+(?:character|type)'] },
  { id: 'photophobia', sec: 'B', group: 'Symptoms', label: 'Photophobia', type: 'tri', aliases: ['photophobia', '(?:sensitivity|sensitive)\\s+to\\s+light', 'light\\s+sensitivity'] },
  { id: 'fbs', sec: 'B', group: 'Symptoms', label: 'Foreign body sensation', type: 'tri', aliases: ['foreign\\s+body(?:\\s+sensation)?', 'grittiness', 'gritty(?:\\s+feeling)?', 'sandy\\s+feeling'] },
  { id: 'flashes', sec: 'B', group: 'Symptoms', label: 'Flashes', type: 'tri', aliases: ['flash(?:es|ing)?(?:\\s+(?:of\\s+)?lights?)?', 'photopsia'] },
  { id: 'floaters', sec: 'B', group: 'Symptoms', label: 'Floaters', type: 'tri', aliases: ['floaters', 'floating\\s+(?:spots|objects)'] },
  { id: 'curtain', sec: 'B', group: 'Symptoms', label: 'Curtain / shadow over vision', type: 'tri', aliases: ['curtain(?:[- ]like)?(?:\\s+(?:over|across)\\s+(?:the\\s+)?vision)?', 'shadow\\s+(?:over|across)\\s+(?:the\\s+)?vision', 'veil'] },
  { id: 'headache', sec: 'B', group: 'Symptoms', label: 'Headache', type: 'tri', aliases: ['headaches?'] },
  { id: 'vomiting', sec: 'B', group: 'Symptoms', label: 'Nausea / vomiting', type: 'tri', aliases: ['(?:nausea\\s+and\\s+)?vomit(?:ing|s|ed)?', 'nausea'] },
  { id: 'suddenLoss', sec: 'B', group: 'Symptoms', label: 'Sudden loss of vision', type: 'tri',
    aliases: ['sudden(?:ly)?\\s+(?:painless\\s+)?(?:loss\\s+of\\s+(?:vision|sight)|visual\\s+loss|vision\\s+loss|lost\\s+(?:vision|sight))'] },

  { id: 'hazy', sec: 'B', group: 'Cataract-oriented questions', label: 'Cloudy / hazy vision', type: 'tri', cataract: true,
    aliases: ['(?:cloudy|hazy|foggy|misty|milky)(?:\\s+vision)?', 'cloudiness', 'haziness'] },
  { id: 'halos', sec: 'B', group: 'Cataract-oriented questions', label: 'Glare / halos', type: 'tri', cataract: true,
    aliases: ['halos?', 'rainbow\\s+(?:rings?|colou?rs?)', 'rings?\\s+around\\s+lights?', 'glare'] },
  { id: 'night', sec: 'B', group: 'Cataract-oriented questions', label: 'Worse at night', type: 'tri', cataract: true,
    aliases: ['worse\\s+at\\s+night', '(?:poor|reduced|bad)\\s+night\\s+vision', 'night\\s+(?:vision\\s+)?(?:difficulty|problems?|blindness)', 'difficulty\\s+(?:seeing\\s+)?at\\s+night'] },
  { id: 'bright', sec: 'B', group: 'Cataract-oriented questions', label: 'Bright-light difficulty', type: 'tri', cataract: true,
    aliases: ['(?:difficulty|problems?|trouble)\\s+(?:in|with)\\s+bright\\s+lights?', 'worse\\s+in\\s+bright\\s+lights?', 'bright[- ]light(?:\\s+(?:difficulty|problems?|sensitivity))?'] },
  { id: 'cataractFamily', sec: 'B', group: 'Cataract-oriented questions', label: 'Family history of cataract', type: 'tri', cataract: true,
    aliases: ['family\\s+history\\s+of\\s+cataracts?', 'cataracts?\\s+in\\s+the\\s+family', 'cataract\\s+family\\s+history'] },

  { id: 'trauma', sec: 'B', group: 'Trauma & injury', label: 'Trauma', type: 'tri', detail: 'traumaDetail',
    aliases: ['(?:history\\s+of\\s+)?trauma', 'injur(?:y|ies|ed)', 'hit\\s+(?:in|on)\\s+the\\s+eye'] },
  { id: 'traumaDetail', sec: 'B', group: 'Trauma & injury', label: 'Mechanism / time of injury', type: 'text', aliases: ['mechanism(?:\\s+of\\s+injury)?'] },
  { id: 'chemical', sec: 'B', group: 'Trauma & injury', label: 'Chemical injury', type: 'tri', detail: 'chemicalAgent',
    aliases: ['chemical(?:\\s+(?:injury|splash|exposure|burn))?'] },
  { id: 'chemicalAgent', sec: 'B', group: 'Trauma & injury', label: 'Chemical agent', type: 'text', placeholder: 'e.g. acid, alkali, lime', aliases: ['agent'] },
  { id: 'penetrating', sec: 'B', group: 'Trauma & injury', label: 'Penetrating injury', type: 'tri',
    aliases: ['penetrating(?:\\s+(?:eye\\s+)?injury)?', 'perforating(?:\\s+injury)?', 'open\\s+globe'] },
  { id: 'bleeding', sec: 'B', group: 'Trauma & injury', label: 'Bleeding from eye', type: 'tri', aliases: ['bleeding(?:\\s+from\\s+the\\s+eye)?'] },

  { id: 'surgery', sec: 'B', group: 'Background', label: 'Previous eye surgery', type: 'tri', detail: 'surgeryDetail',
    aliases: ['previous\\s+(?:eye\\s+)?(?:surger(?:y|ies)|operations?)', 'past\\s+(?:eye\\s+)?surgery', 'eye\\s+surgery', 'operated'] },
  { id: 'surgeryDetail', sec: 'B', group: 'Background', label: 'Surgery details', type: 'text', aliases: [] },
  { id: 'spectacles', sec: 'B', group: 'Background', label: 'Spectacles / contact lenses', type: 'tri', detail: 'spectaclesDetail',
    aliases: ['spectacles?', 'eye\\s*glasses', 'glasses', 'contact\\s+lens(?:es)?'] },
  { id: 'spectaclesDetail', sec: 'B', group: 'Background', label: 'Spectacle details', type: 'text', aliases: [] },
  { id: 'drops', sec: 'B', group: 'Background', label: 'Current eye drops / medication', type: 'text',
    aliases: [{ re: '(?:current\\s+)?(?:eye\\s+)?drops', notIn: 'E' }, { re: '(?:current\\s+)?medications?', notIn: 'E' }, 'on\\s+treatment\\s+with'] },
  { id: 'pastOcular', sec: 'B', group: 'Background', label: 'Past ocular history', type: 'text', aliases: ['past\\s+ocular\\s+history', 'ocular\\s+history', 'previous\\s+eye\\s+(?:problems?|disease)'] },
  { id: 'medicalHx', sec: 'B', group: 'Background', label: 'Medical history', type: 'text', aliases: ['(?:past\\s+)?medical\\s+history', 'systemic\\s+history'] },
  { id: 'familyHx', sec: 'B', group: 'Background', label: 'Family history (other)', type: 'text', aliases: ['family\\s+history(?:\\s+of)?'] },
  { id: 'aggravating', sec: 'B', group: 'Background', label: 'Aggravating / relieving factors', type: 'text',
    aliases: ['aggravat(?:ing|ed)(?:\\s+(?:by|factors?))?', 'reliev(?:ing|ed)(?:\\s+(?:by|factors?))?', 'worse\\s+(?:with|when)', 'better\\s+(?:with|when)'] },
  { id: 'severity', sec: 'B', group: 'Background', label: 'Effect on daily life', type: 'text',
    aliases: ['effect\\s+on\\s+daily\\s+(?:life|activities)', 'daily\\s+(?:life|activities)', 'affects?\\s+(?:his|her|their)\\s+(?:work|reading|daily)'] },
  { id: 'historyNotes', sec: 'B', group: 'Background', label: 'Other history notes', type: 'text', wide: true, aliases: [] },

  // ── C. Nursing examination (VA first) ───────────────────────────────
  { id: 'vaRE', sec: 'C', group: 'Visual acuity', label: 'VA RE (distance)', type: 'va', req: 'critical', aliases: [] },
  { id: 'vaLE', sec: 'C', group: 'Visual acuity', label: 'VA LE (distance)', type: 'va', req: 'critical', aliases: [] },
  { id: 'vaPHRE', sec: 'C', group: 'Visual acuity', label: 'VA RE pinhole / glasses', type: 'va', aliases: [] },
  { id: 'vaPHLE', sec: 'C', group: 'Visual acuity', label: 'VA LE pinhole / glasses', type: 'va', aliases: [] },
  { id: 'nearVA', sec: 'C', group: 'Visual acuity', label: 'Near VA', type: 'text', placeholder: 'e.g. N6', aliases: [] },
  { id: 'paddedEye', sec: 'C', group: 'Trauma handling', label: 'Eye padded on arrival', type: 'tri',
    aliases: ['(?:eye\\s+(?:is\\s+)?)?padded(?:\\s+eye)?', 'eye\\s+pad', 'pad\\s+on\\s+(?:the\\s+)?eye'] },
  { id: 'padReason', sec: 'C', group: 'Trauma handling', label: 'Reason for pad', type: 'text', placeholder: 'Leave blank if unknown',
    aliases: ['reason\\s+for\\s+(?:the\\s+)?pad', 'padded\\s+(?:because|for)'] },
  { id: 'pupils', sec: 'C', group: 'External examination', label: 'Pupils', type: 'text', aliases: ['pupils?(?!\\s+(?:is\\s+)?(?:white|mid))', 'pupillary\\s+(?:reaction|reflex(?:es)?)'] },
  { id: 'whitePupil', sec: 'C', group: 'External examination', label: 'White pupil (leukocoria)', type: 'tri', aliases: ['white\\s+pupil', 'leu[ck]ocoria', 'white\\s+reflex'] },
  { id: 'midDilated', sec: 'C', group: 'External examination', label: 'Mid-dilated / fixed pupil', type: 'tri', aliases: ['mid[- ]?dilated(?:\\s+pupil)?', 'fixed\\s+(?:and\\s+)?(?:mid[- ]?)?dilated(?:\\s+pupil)?', 'semi[- ]?dilated(?:\\s+pupil)?'] },
  { id: 'lids', sec: 'C', group: 'External examination', label: 'Lids', type: 'text', aliases: ['(?:eye)?lids?'] },
  { id: 'conjunctiva', sec: 'C', group: 'External examination', label: 'Conjunctiva', type: 'text', aliases: ['conjunctiva[el]?'] },
  { id: 'cornea', sec: 'C', group: 'External examination', label: 'Cornea', type: 'text', aliases: ['corneal?'] },
  { id: 'examDischarge', sec: 'C', group: 'External examination', label: 'Discharge (observed)', type: 'text', aliases: [{ re: 'discharge', local: true }] },
  { id: 'eyeMovements', sec: 'C', group: 'External examination', label: 'Eye movements / simple tests', type: 'text', aliases: ['(?:extra\\s*)?ocular\\s+movements?', 'eye\\s+movements?', 'eom', 'simple\\s+tests?'] },
  { id: 'iopRE', sec: 'C', group: 'Intraocular pressure', label: 'IOP RE', type: 'iop', unit: 'mmHg', aliases: [] },
  { id: 'iopLE', sec: 'C', group: 'Intraocular pressure', label: 'IOP LE', type: 'iop', unit: 'mmHg', aliases: [] },
  { id: 'examNotes', sec: 'C', group: 'Intraocular pressure', label: 'Other examination findings', type: 'text', wide: true, aliases: ['other\\s+findings', 'findings'] },

  // ── D. Red flags (manual) ───────────────────────────────────────────
  { id: 'manualFlag', sec: 'D', group: 'Nurse-raised', label: 'Other locally defined emergency trigger', type: 'text', wide: true, aliases: [] },

  // ── E. Nursing action & plan ────────────────────────────────────────
  { id: 'dropsGiven', sec: 'E', group: 'Actions', label: 'Drops instilled', type: 'text',
    aliases: [{ re: '(?:eye\\s+)?drops\\s+(?:instilled|given|applied|put\\s+in)', local: true }, { re: 'instilled', local: true }] },
  { id: 'dropsTime', sec: 'E', group: 'Actions', label: 'Time instilled', type: 'time', placeholder: 'HH:MM',
    aliases: [{ re: '(?:time\\s+(?:instilled|given)|instilled\\s+at|given\\s+at)', local: true }] },
  { id: 'dilated', sec: 'E', group: 'Actions', label: 'Dilated for doctor', type: 'tri', detail: 'dilationAgent',
    aliases: [{ re: 'dilat(?:ed|ion|e)(?:\\s+for\\s+(?:the\\s+)?doctor)?', local: true }] },
  { id: 'dilationAgent', sec: 'E', group: 'Actions', label: 'Dilating agent', type: 'text', aliases: [{ re: 'dilating\\s+(?:drops?|agent)', local: true }] },
  { id: 'investigations', sec: 'E', group: 'Actions', label: 'Investigations sent', type: 'text', wide: true,
    aliases: ['investigations?', 'tests?\\s+(?:sent|done|requested)', 'sent\\s+for'] },
  { id: 'education', sec: 'E', group: 'Actions', label: 'Health education given', type: 'text', wide: true,
    aliases: ['health\\s+education', '(?:educated|counsel+ed)\\s+(?:on|about)', 'advised\\s+(?:on|to)'] },
  { id: 'referral', sec: 'E', group: 'Plan', label: 'Referral to', type: 'text', req: 'recommended',
    aliases: ['refer(?:red|ral)?(?:\\s+to)?', 'routed\\s+to', '(?:sent|send)\\s+to', 'to\\s+be\\s+seen\\s+(?:at|in|by)', 'plan'] },
  { id: 'priority', sec: 'E', group: 'Plan', label: 'Priority', type: 'select', req: 'critical', options: ['', 'Routine', 'Urgent', 'Emergency'],
    synonyms: { Routine: ['routine', 'normal', 'non urgent', 'non-urgent'], Urgent: ['urgent', 'soon'], Emergency: ['emergency', 'immediate', 'stat'] },
    aliases: ['priority', 'triage(?:\\s+category)?'] },
  { id: 'nurseNotes', sec: 'E', group: 'Plan', label: 'Nursing notes', type: 'text', wide: true, aliases: ['(?:nursing\\s+|additional\\s+)?notes?', 'remarks?'] },
  { id: 'sbar', sec: 'E', group: 'Handover', label: 'SBAR / handover summary', type: 'longtext', wide: true, aliases: [] },
];

export const FIELD = Object.fromEntries(FIELDS.map(f => [f.id, f]));
export const FIELD_IDS = FIELDS.map(f => f.id);

// Visual-acuity / IOP dictation in section C is eye-qualified: a measurement "mode" + an eye token.
export const C_MODES = [
  { mode: 'ph', re: '(?:with\\s+|through\\s+(?:the\\s+)?)?pin\\s?hole|ph|with\\s+(?:glasses|spectacles)|(?:best\\s+)?corrected(?:\\s+va)?' },
  { mode: 'near', re: 'near(?:\\s+(?:va|vision|visual\\s+acuity))?' },
  { mode: 'iop', re: 'iop|intra\\s?ocular\\s+pressures?|eye\\s+pressures?|pressures?|tonometry' },
  { mode: 'va', re: 'va|visual\\s+acuity|(?:distance\\s+)?vision|acuity|unaided(?:\\s+va)?' },
];
export const C_EYES = [
  { eye: 'BE', re: '(?:in\\s+)?(?:both|each)(?:\\s+eyes?)?|bilaterally|ou' },
  { eye: 'RE', re: '(?:in\\s+)?(?:the\\s+)?right(?:\\s+eye)?|r\\.?\\s?e\\.?(?=\\s|$|[,:])|od' },
  { eye: 'LE', re: '(?:in\\s+)?(?:the\\s+)?left(?:\\s+eye)?|l\\.?\\s?e\\.?(?=\\s|$|[,:])|os' },
];
export const MODE_FIELDS = { va: { RE: 'vaRE', LE: 'vaLE' }, ph: { RE: 'vaPHRE', LE: 'vaPHLE' }, iop: { RE: 'iopRE', LE: 'iopLE' }, near: { RE: 'nearVA', LE: 'nearVA' } };

export function blankValues() {
  const v = {};
  for (const f of FIELDS) {
    if (f.type === 'tri') v[f.id] = NA;
    else if (f.id === 'eye') v[f.id] = NA;
    else if (f.id === 'ageUnit') v[f.id] = 'years';
    else if (f.id === 'sugarUnit') v[f.id] = 'mg/dL';
    else if (f.id === 'sugarType') v[f.id] = 'RBS';
    else v[f.id] = '';
  }
  return v;
}

export function isEmpty(id, v) {
  const s = String(v ?? '').trim();
  if (!s) return true;
  const f = FIELD[id];
  if (f && (f.type === 'tri' || id === 'eye') && s === NA) return true;
  return false;
}

/** Display a value with its clinical unit (Bible §7). */
export function withUnit(id, values) {
  const v = String(values[id] ?? '').trim();
  if (!v) return '';
  const f = FIELD[id];
  if (id === 'sugar') return /^\d/.test(v) ? `${v} ${values.sugarUnit || 'mg/dL'}` : v;
  if (id === 'age') return /^\d/.test(v) ? `${v} ${values.ageUnit || 'years'}` : v;
  if (f?.unit && /^\d/.test(v)) return `${v} ${f.unit}`;
  return v;
}

/** Age in days, or null when unknown. */
export function ageInDays(values) {
  const n = parseFloat(values.age);
  if (!isFinite(n)) return null;
  const u = values.ageUnit || 'years';
  return n * ({ years: 365.25, months: 30.44, weeks: 7, days: 1 }[u] || 365.25);
}
