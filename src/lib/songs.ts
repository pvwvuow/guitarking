/* Archive data — real songs with chord sheets.

   Reference source (مرجع): ahaang.com (رسانه آهنگ) — lyrics AND audio.
   Workflow for new songs:
     1. take the song file, run the GuitarKing engine on it (python/chord_detect.py)
     2. write the sheet with per-line timings (SheetSeg.t, seconds) so the
        on-page player can highlight the active line while it plays
     3. the audio file does NOT need to stay in the repo: remove it from
        public/demo and point `audio` at the source site (or drop `audio`
        — the player simply hides) — always keep `sourceRef` so the
        source is credited (با ذکر منبع).

   «کو بهشتمون» is fully analyzed by the GuitarKing engine (real data);
   other sheets are editorial placements being replaced by verified
   transcriptions with lyrics credited to their source. */

export interface SheetSeg {
  chord: string;
  text: string;
  /** start time in seconds — enables play-along highlighting */
  t?: number;
}
export interface SheetSection {
  label: string;
  lines: SheetSeg[][];
}
export interface BotSection {
  label: string;
  time: string;
  chords: string[];
}
export interface SongEntry {
  slug: string;
  title: string;
  artist: string;
  genre: "پاپ" | "راک" | "فولک";
  dateFa: string;
  isNew?: boolean;
  key: string;
  tempo?: number;
  difficulty: "آسان" | "متوسط" | "سخت";
  poster: string;
  source: "bot" | "editorial";
  description: string;
  /** audio for the on-page play-along player (local path or external URL) */
  audio?: string;
  /** source site credited on the song page (با ذکر منبع) */
  sourceRef?: { name: string; url: string };
  /** lyric texts are the official ones (not layout samples) */
  officialLyrics?: boolean;
  sections: SheetSection[];
  bot?: {
    duration: string;
    tempo: number;
    key: string;
    confidence: number;
    sections: BotSection[];
  };
}

export const SONGS: SongEntry[] = [
  {
    slug: "sad-gozashtam",
    title: "صد گذاشتم",
    artist: "رامین بی باک",
    genre: "پاپ",
    dateFa: "امروز",
    isNew: true,
    key: "Fm",
    tempo: 123,
    difficulty: "متوسط",
    poster: "/posters/sad-gozashtam.jpg",
    source: "bot",
    audio:
      "https://dl.rozmusic.com/Music/1405/08/08/Ramin%20Bibak%20-%20Sad%20Gozashtam%20%28128%29.mp3",
    sourceRef: {
      name: "رزمیوزیک (rozmusic.com)",
      url: "https://rozmusic.com/رامین-بی-باک-صد-گذاشتم.html",
    },
    officialLyrics: true,
    description:
      "ترانه‌ی تازه‌ی رامین بی باک. گیتارکینگ کل آهنگ را بند‌به‌بند با موتور تشخیص شنیده و هر باری که همخوان تکرار شده، اکوردهایش دوباره بازبینی شده است: گام فا مینور و چرخه‌ی اصلی Fm – Cm – Bbm – Cm که از بداهه تا فید اوت یکبار هم عوض نمی‌شود. متن و فایل صوتی از رزمیوزیک آمده (با ذکر منبع).",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Fm", text: "بداهه‌ی گیتار", t: 1.5 },
            { chord: "Cm", text: "چرخه‌ی اصلی", t: 6.1 },
            { chord: "Bbm", text: "تا ورود صدا", t: 11.2 },
            { chord: "Cm", text: "بازگشت چرخه", t: 16.1 },
            { chord: "Fm", text: "آماده‌ی ورود صدا", t: 24.5 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Cm", text: "یهو شدم واست غریبه", t: 29.6 },
            { chord: "Bbm", text: "کارای تو واقعا عجیبه", t: 32.2 },
          ],
          [
            { chord: "Eb7", text: "اون چشای آدم فریبت", t: 37.1 },
            { chord: "G7", text: "انگار مارو", t: 38.8 },
            { chord: "Fm", text: "اصلا ندیده", t: 42.8 },
          ],
          [
            { chord: "Fm", text: "اونکه بدون من شبو یه لحظه", t: 45.1 },
            { chord: "Cm7", text: "خوابش نمیرفت", t: 48.3 },
          ],
          [
            { chord: "Cm7", text: "حالا دیگه کنار من نیست", t: 51.5 },
            { chord: "Eb7", text: "میگن پیش", t: 52.6 },
            { chord: "Bbm", text: "آدم جدیده", t: 54.6 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "Fm", text: "واست چیو کم گذاشتم", t: 62.7 },
            { chord: "Cm", text: "من که واست صد گذاشتم", t: 68.3 },
          ],
          [
            { chord: "Eb7", text: "زیاد من کم بود برات", t: 72.3 },
            { chord: "Bbm", text: "رو بود آخه", t: 74.6 },
            { chord: "Cm", text: "هرچی داشتم", t: 78.4 },
          ],
        ],
      },
      {
        label: "تکرار همخوان",
        lines: [
          [
            { chord: "Fm", text: "واست چیو کم گذاشتم", t: 83.5 },
            { chord: "Cm", text: "من که واست صد گذاشتم", t: 89.2 },
          ],
          [
            { chord: "Bbm", text: "زیاد من کم بود برات", t: 94.6 },
            { chord: "Cm", text: "رو بود آخه هرچی داشتم", t: 98.6 },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Ab", text: "گفتم بمون درست میشه", t: 104.6 },
            { chord: "Fm", text: "فکر نمیکردم", t: 106.4 },
            { chord: "Cm", text: "که بغض میشه", t: 109.2 },
          ],
          [
            { chord: "Bbm", text: "همه حرفام میمونه تو گلوم", t: 113.6 },
            { chord: "Cm", text: "اون میاد میشینه", t: 119.0 },
            { chord: "G7", text: "درست پیشت", t: 121.6 },
          ],
        ],
      },
      {
        label: "پل",
        lines: [
          [
            { chord: "Eb7", text: "شاید نرسه کوه به کوه", t: 133.7 },
            { chord: "Bbm", text: "میرسه به آدم", t: 135.4 },
            { chord: "Cm", text: "به آدم", t: 139.2 },
            { chord: "Fm", text: "—", t: 143.4 },
          ],
          [
            { chord: "Eb7", text: "چیزایی یادت میدم که یادت ندادن", t: 153.8 },
            { chord: "Bbm", text: "تو گل بودی", t: 155.2 },
            { chord: "Cm", text: "ولی اون خارت برا من", t: 159.4 },
          ],
        ],
      },
      {
        label: "همخوان پایانی",
        lines: [
          [
            { chord: "Fm", text: "واست چیو کم گذاشتم", t: 163.6 },
            { chord: "Cm", text: "من که واست صد گذاشتم", t: 170.2 },
          ],
          [
            { chord: "Bbm", text: "زیاد من کم بود برات", t: 175.6 },
            { chord: "Cm", text: "رو بود آخه هرچی داشتم", t: 179.4 },
          ],
        ],
      },
      {
        label: "پایان",
        lines: [
          [
            { chord: "Fm", text: "فید اوت پایانی", t: 190.6 },
            { chord: "Cm", text: "تا آخر", t: 195.6 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:19",
      tempo: 123,
      key: "Fm",
      confidence: 73.1,
      sections: [
        { label: "A", time: "0:00 – 0:29", chords: ["Fm", "Cm", "Bbm", "Cm"] },
        { label: "A", time: "0:29 – 1:02", chords: ["Cm", "Bbm", "Eb7", "G7", "Fm"] },
        { label: "A", time: "1:02 – 1:44", chords: ["Fm", "Cm", "Eb7", "Bbm"] },
        { label: "A", time: "1:44 – 2:13", chords: ["Ab", "Fm", "Cm", "Bbm", "G7"] },
        { label: "A", time: "2:13 – 2:42", chords: ["Eb7", "Bbm", "Cm", "Fm"] },
        { label: "A", time: "2:42 – 3:19", chords: ["Fm", "Cm", "Bbm"] },
      ],
    },
  },
  {
    slug: "koo-beheshtemoon",
    title: "کو بهشتمون",
    artist: "امین قباد",
    genre: "پاپ",
    dateFa: "امروز",
    isNew: true,
    key: "Am",
    tempo: 112,
    difficulty: "متوسط",
    poster: "/posters/koo-beheshtemoon.jpg",
    source: "bot",
    audio: "/demo/koo-beheshtemoon.mp3",
    sourceRef: {
      name: "رسانه آهنگ (ahaang.com)",
      url: "https://ahaang.com/lyric/متن-آهنگ-کو-بهشتمون-امین-قباد",
    },
    officialLyrics: true,
    description:
      "آهنگی پاپ و دلنشین از امین قباد. گیتارکینگ برگه‌ی اکورد را از روی خودِ آهنگ نوشته: گام لا مینور، تمپوی ۱۱۲ و چرخه‌ی بند Dm – Am – Em که در همخوان به Am – G – F می‌رسد. متن ترانه از رسانه آهنگ نقل شده (با ذکر منبع) و تکرارهای همخوان هم مثل خود آهنگ، دوبار نوشته شده است.",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Am", text: "بداهه", t: 0.5 },
            { chord: "C", text: "تا ورود صدا", t: 4.5 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Dm", text: "چه تفاهمی دوتایی میدیم به دست باد", t: 10.5 },
            { chord: "Am", text: "تو موهاتو من خاطره هاتو", t: 18.5 },
            { chord: "Em", text: "وای", t: 23.5 },
            { chord: "Am", text: "—", t: 25.5 },
          ],
          [
            { chord: "Am", text: "چه تفاهمی دوتایی داریم", t: 29.5 },
            { chord: "F", text: "چشم میبندیم", t: 37.5 },
            { chord: "Em", text: "تو روی منو من رو", t: 41.2 },
            { chord: "Am", text: "هرکی غیر تو", t: 45.0 },
          ],
        ],
      },
      {
        label: "پیش‌همخوان",
        lines: [
          [
            { chord: "C", text: "یادته پیش هم هر شب", t: 48.4 },
            { chord: "G", text: "خیره به آسمون", t: 50.6 },
            { chord: "Am", text: "میگفتی", t: 52.2 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "Am", text: "عشقم نگاه کن", t: 63.8 },
            { chord: "G", text: "اونه ستارمون", t: 69.2 },
            { chord: "F", text: "ستارمون", t: 72.2 },
            { chord: "G", text: "کو ستارمون", t: 75.2 },
          ],
          [
            { chord: "C", text: "یادته با شادی", t: 78.6 },
            { chord: "Am", text: "پاک میکردیم اشکامونو", t: 81.2 },
            { chord: "Em", text: "از گونه مون", t: 84.4 },
            { chord: "Am", text: "—", t: 87.4 },
          ],
          [
            { chord: "C", text: "تو نباشی فرشته ای نداره", t: 90.4 },
            { chord: "G", text: "دیگه بهشتمون", t: 93.4 },
            { chord: "Em", text: "بهشتمون کو بهشتمون", t: 96.2 },
          ],
          [
            { chord: "Am", text: "کو بهشتمون کو بهشتمون …", t: 100.6 },
            { chord: "Em", text: "—", t: 108.2 },
            { chord: "Am", text: "—", t: 110.6 },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Am", text: "چه تفاهمی داریم دروغ میگیم", t: 112.2 },
            { chord: "F", text: "دوتاییمون", t: 115.4 },
            { chord: "C", text: "من به خودم", t: 118.0 },
            { chord: "Em", text: "تو به دوتاییمون", t: 121.4 },
            { chord: "E7", text: "—", t: 124.0 },
          ],
          [
            { chord: "F", text: "چه تفاهمی هنوز که عاشقیم", t: 127.2 },
            { chord: "Am", text: "دوتاییمون", t: 130.2 },
            { chord: "C", text: "من کجا برم", t: 133.2 },
            { chord: "G", text: "تا چشات میگه بمون", t: 136.2 },
            { chord: "F", text: "—", t: 139.4 },
          ],
        ],
      },
      {
        label: "پیش‌همخوان",
        lines: [
          [
            { chord: "C", text: "یادته پیش هم هر شب", t: 142.0 },
            { chord: "G", text: "خیره به آسمون میگفتی", t: 145.2 },
            { chord: "Am", text: "—", t: 148.4 },
          ],
        ],
      },
      {
        label: "همخوان پایانی",
        lines: [
          [
            { chord: "Am", text: "عشقم نگاه کن اونه ستارمون", t: 151.8 },
            { chord: "Em", text: "ستارمون کو ستارمون", t: 163.6 },
            { chord: "Am", text: "—", t: 165.8 },
          ],
          [
            { chord: "C", text: "یادته با شادی", t: 170.4 },
            { chord: "G", text: "پاک میکردیم اشکامونو از گونه مون", t: 176.6 },
            { chord: "Am", text: "—", t: 178.6 },
          ],
          [
            { chord: "C", text: "تو نباشی فرشته ای نداره", t: 180.6 },
            { chord: "Am", text: "دیگه بهشتمون", t: 184.2 },
            { chord: "Em", text: "بهشتمون کو بهشتمون", t: 185.4 },
          ],
          [
            { chord: "C", text: "کو بهشتمون", t: 195.0 },
            { chord: "G", text: "کو بهشتمون …", t: 197.4 },
            { chord: "Am", text: "—", t: 200.2 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:31",
      tempo: 112,
      key: "Am",
      confidence: 62.6,
      sections: [
        { label: "A", time: "0:00 – 0:10", chords: ["Am", "C"] },
        { label: "B", time: "0:10 – 1:03", chords: ["Dm", "Am", "Em", "F", "C", "G"] },
        { label: "B", time: "1:03 – 1:52", chords: ["Am", "G", "F", "C", "Em"] },
        { label: "B", time: "1:52 – 2:22", chords: ["Am", "F", "C", "Em", "E7", "G"] },
        { label: "B", time: "2:22 – 3:31", chords: ["Am", "C", "G", "Em", "F"] },
      ],
    },
  },
  {
    slug: "behet-ghol-midam",
    title: "بهت قول میدم",
    artist: "محسن یگانه",
    genre: "پاپ",
    dateFa: "دیروز",
    isNew: true,
    key: "Em",
    difficulty: "آسان",
    poster: "/posters/behet-ghol-midam.jpg",
    source: "editorial",
    sourceRef: {
      name: "رسانه آهنگ (ahaang.com)",
      url: "https://ahaang.com/محسن-یگانه-بهت-قول-میدم",
    },
    officialLyrics: true,
    description:
      "یکی از ماندگارترین ترانه‌های محسن یگانه. متن ترانه از رسانه آهنگ نقل شده؛ با گام می مینور و ریتم آرام، انتخابی عالی برای تمرین آرپژ و انگشت‌گذاری نرم.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [{ chord: "Em", text: "خودت می‌خوای بری خاطره شی" }],
          [{ chord: "C", text: "اما دلت می‌سوزه، تظاهر می‌کنی" }],
          [{ chord: "G", text: "عاشقمی، این بازی هر روزت" }],
          [{ chord: "D", text: "نترس، تا دمِ دم رفتن همش" }],
          [{ chord: "Em", text: "دلشور می‌گره، دو روز بگذره" }],
          [{ chord: "C", text: "این دلشورها از خاطرت می‌ره" }],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [{ chord: "C", text: "بهت قول می‌دم سخت نیست" }],
          [{ chord: "G", text: "لااقل برای تو راحت باش" }],
          [{ chord: "Am", text: "دورم از تو و دنیایه تو، راحت باش" }],
          [{ chord: "D", text: "هیچ‌کس نمیاد جای تو" }],
          [{ chord: "Em", text: "دلشوره دارم من واسه فردایه تو" }],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [{ chord: "Am", text: "از عشق هر چیزی که می‌شناسمو" }],
          [{ chord: "Em", text: "از من گرفتی تو" }],
          [{ chord: "C", text: "باقی مونده احساسمو از من گرفتی" }],
          [{ chord: "G", text: "می‌خوای من باشیو یادت بره" }],
          [{ chord: "Am", text: "مایی، وجود داره خودت" }],
          [{ chord: "Em", text: "آمادی رفتنی، ترست نمی‌ذاره" }],
          [{ chord: "C", text: "اصلا نترس، راحت برو" }],
          [{ chord: "G", text: "بی من هیچ‌کی به جز تو" }],
          [{ chord: "Am", text: "منو یادش نیست" }],
          [{ chord: "Em", text: "فکر کردی کی از من خبر داره" }],
          [{ chord: "C", text: "راحت برو، هیچ‌کی حواسش نیست" }],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [{ chord: "C", text: "بهت قول می‌دم سخت نیست" }],
          [{ chord: "G", text: "لااقل برای تو راحت باش" }],
          [{ chord: "Am", text: "دورم از تو و دنیایه تو، راحت باش" }],
          [{ chord: "D", text: "هیچ‌کس نمیاد جای تو" }],
          [{ chord: "Em", text: "دلشوره دارم من واسه فردایه تو" }],
        ],
      },
    ],
  },
  {
    slug: "setare-baroon",
    title: "ستاره بارون",
    artist: "مرتضی پاشایی",
    genre: "پاپ",
    dateFa: "۳ روز پیش",
    key: "Em",
    difficulty: "آسان",
    poster: "/posters/setare-baroon.jpg",
    source: "editorial",
    description:
      "ترانه‌ای خاطره‌ساز از مرتضی پاشایی. پیشروی آکوردی ساده در می مینور که روی گیتار آکوستیک بسیار خوب می‌نشیند.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Em", text: "شب از ابر" },
            { chord: "C", text: "پر شده و" },
            { chord: "G", text: "ستاره‌ها" },
          ],
          [
            { chord: "D", text: "یه بهونه" },
            { chord: "Em", text: "برای موندن می‌خوان" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "C", text: "ستاره بارون" },
            { chord: "G", text: "همه‌ی شهر رو تر کرده" },
          ],
          [
            { chord: "Am", text: "و من بی‌قرار" },
            { chord: "D", text: "تا صبح" },
            { chord: "Em", text: "موندم" },
          ],
        ],
      },
      {
        label: "پل",
        lines: [
          [
            { chord: "Am", text: "باز این قصه" },
            { chord: "C", text: "تکرار می‌شه" },
            { chord: "B7", text: "و من می‌مونم" },
          ],
        ],
      },
    ],
  },
  {
    slug: "cheshm-e-siah",
    title: "چشم سیاه",
    artist: "حمید عسکری",
    genre: "پاپ",
    dateFa: "این هفته",
    key: "Dm",
    difficulty: "آسان",
    poster: "/posters/cheshm-e-siah.jpg",
    source: "editorial",
    description:
      "قطعه‌ای عاشقانه از حمید عسکری در رِ مینور؛ مناسب تمرین تغییر آکورد سریع بین پوزسیون‌های باز.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Dm", text: "چشم سیاه تو" },
            { chord: "Bb", text: "شبِ من را" },
            { chord: "F", text: "سپید کرد" },
          ],
          [
            { chord: "C", text: "و قلب من" },
            { chord: "Dm", text: "در همین نگاه ماند" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "Bb", text: "بمان کنارم" },
            { chord: "C", text: "تا صبحِ این قصه" },
          ],
          [
            { chord: "F", text: "که بی تو" },
            { chord: "Dm", text: "هیچ آفتابی" },
            { chord: "A7", text: "طلوع نمی‌کند" },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Gm", text: "باز هم شب" },
            { chord: "Bb", text: "و حسرتی" },
            { chord: "F", text: "به اندازه‌ی دریا" },
          ],
        ],
      },
    ],
  },
  {
    slug: "dehati",
    title: "دهاتی",
    artist: "شادمهر عقیلی",
    genre: "پاپ",
    dateFa: "هفته‌ی پیش",
    key: "C",
    difficulty: "آسان",
    poster: "/posters/dehati.jpg",
    source: "editorial",
    description:
      "قطعه‌ای شاد و پرانرژی از شادمهر عقیلی. با گام دو ماژور و آکوردهای باز، عالی برای گرم‌کردن انگشت‌ها و تمرین ریتم.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [
            { chord: "C", text: "یه روزی بود" },
            { chord: "G", text: "که همه‌چی" },
            { chord: "Am", text: "ساده بود" },
          ],
          [
            { chord: "F", text: "و دل‌ها" },
            { chord: "C", text: "مثل سنگ" },
            { chord: "G", text: "سخت نبودن" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "F", text: "دهاتی بودم" },
            { chord: "G", text: "و ساده و" },
            { chord: "C", text: "خوشبخت" },
          ],
          [
            { chord: "Am", text: "تا که تو اومدی" },
            { chord: "G", text: "و همه‌چی" },
            { chord: "C", text: "عوض شد" },
          ],
        ],
      },
    ],
  },
  {
    slug: "jadeh-haraz",
    title: "جاده هراز",
    artist: "آرون افشار",
    genre: "فولک",
    dateFa: "۲ هفته پیش",
    key: "Am",
    difficulty: "متوسط",
    poster: "/posters/jadeh-haraz.jpg",
    source: "editorial",
    description:
      "ترانه‌ای فولک و پرکشش از آرون افشار با بویی از موسیقی شمال. ترکیبی از ریتم‌های محلی و آکوردهای مینور که روی گیتار جان می‌گیرد.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Am", text: "جاده‌ی هراز" },
            { chord: "Dm", text: "پر از مه" },
            { chord: "G", text: "و سفر بود" },
          ],
          [
            { chord: "C", text: "و من به یاد" },
            { chord: "F", text: "چشم‌های تو" },
            { chord: "E7", text: "مانده‌ام" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "F", text: "بزن گلی" },
            { chord: "G", text: "به پاکنه‌ی هراز" },
          ],
          [
            { chord: "Am", text: "که بوی سفر" },
            { chord: "E7", text: "بده این" },
            { chord: "Am", text: "خانه را" },
          ],
        ],
      },
    ],
  },
  {
    slug: "gol-e-yakh",
    title: "گل یخ",
    artist: "کوروش یغمایی",
    genre: "فولک",
    dateFa: "۲ هفته پیش",
    key: "Em",
    difficulty: "متوسط",
    poster: "/posters/gol-e-yakh.jpg",
    source: "editorial",
    description:
      "شاهکار کوروش یغمایی از دهه‌ی چهل؛ آمیزه‌ای از فولک و سایکدلیک با یکی از مشهورترین ریف‌های می مینور موسیقی ایران.",
    sections: [
      {
        label: "ریف",
        lines: [
          [
            { chord: "Em", text: "ریف مشهور" },
            { chord: "D", text: "دو میزان" },
            { chord: "Em", text: "تکرار" },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Em", text: "گل یخ بدم" },
            { chord: "D", text: "به سفره‌ی جانت" },
            { chord: "G", text: "ای یار" },
          ],
          [
            { chord: "Am", text: "تا که نلرزد" },
            { chord: "B7", text: "دلِ" },
            { chord: "Em", text: "سردت" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "G", text: "بوی نان و" },
            { chord: "D", text: "شب‌های بی‌ستاره" },
          ],
          [
            { chord: "Am", text: "و همین" },
            { chord: "B7", text: "همه‌ی دار و" },
            { chord: "Em", text: "دسته‌ی من است" },
          ],
        ],
      },
    ],
  },
  {
    slug: "ashegh-kosh",
    title: "عاشق کش",
    artist: "آرون افشار",
    genre: "راک",
    dateFa: "۲ هفته پیش",
    key: "Am",
    difficulty: "سخت",
    poster: "/posters/ashegh-kosh.jpg",
    source: "editorial",
    description:
      "قطعه‌ای پرانرژی از آرون در سبک پاپ-راک؛ برای تمرین آکوردهای بَر و ریتم‌های راک عالی است.",
    sections: [
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Am", text: "با نگاهت" },
            { chord: "Dm", text: "دلم را" },
            { chord: "E7", text: "شکاری کردی" },
          ],
          [
            { chord: "Am", text: "و رفتی و گذاشتی" },
            { chord: "F", text: "این دلِ" },
            { chord: "E7", text: "بی‌قرار را" },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "F", text: "عاشق کشِ من" },
            { chord: "G", text: "تو دیگری را" },
            { chord: "Am", text: "داری" },
          ],
          [
            { chord: "F", text: "و من ماندم" },
            { chord: "G", text: "با این گیتار" },
            { chord: "Am", text: "و این غم" },
          ],
        ],
      },
    ],
  },
];

export const FEATURED_SLUG = "koo-beheshtemoon";

export function getSong(slug: string): SongEntry | undefined {
  return SONGS.find((s) => s.slug === slug);
}

/** unique chords of a song, in order of appearance (cap 12) */
export function songChords(song: SongEntry): string[] {
  const out: string[] = [];
  for (const sec of song.sections)
    for (const line of sec.lines)
      for (const seg of line)
        if (!out.includes(seg.chord)) out.push(seg.chord);
  return out.slice(0, 12);
}
