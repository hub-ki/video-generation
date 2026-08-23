// The spoken track, anchored to CLIP IDS from timeline.json — never to timestamps. Re-time the
// cut and the audio follows, because both are derived from index.html.
//
// This is the ONLY file that may contain a phonetic respelling. Never copy one onto a card.
export const voice = 'JBFqnCBsd6RMkjVDRZzb';        // a premade voice — works on any plan
export const model = 'eleven_multilingual_v2';
export const language = 'en';                        // drives the transcription model
export const pronunciations = {};                    // TTS spelling -> what must be HEARD

export const sections = [
  {
    id: '01-intro',
    anchor: 'intro',
    text: 'One sentence, read aloud before you keep it.',
    topics: ['the thing this line is about'],        // for verify-topics.mjs; per topic, not per sentence
  },
];
