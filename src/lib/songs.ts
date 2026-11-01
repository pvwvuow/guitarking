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
      "ترانه‌ی تازه‌ی رامین بی باک. گیتارکینگ کل آهنگ را بند‌به‌بند با موتور تشخیص شنیده، جای هر بیت را با خود صدا تطبیق داده و هر جای برگه که همخوان یا بند تکرار شده، اکوردهایش دوباره بازبینی شده است: گام فا مینور، چرخه‌ی اصلی Fm – Cm – Bbm – Cm و سولوی گیتار روی همین چرخه. متن و فایل صوتی از رزمیوزیک آمده (با ذکر منبع).",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Fm", text: "بداهه‌ی گیتار", t: 1.65 },
            { chord: "Cm", text: "—", t: 5.97 },
            { chord: "Bbm", text: "—", t: 11.4 },
            { chord: "Cm", text: "تا ورود صدا", t: 16.21 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [{ chord: "Fm", text: "یهو شدم واست غریبه کارای تو واقعا عجیبه", t: 22.18 }],
          [{ chord: "Cm", text: "اون چشای آدم فریبت انگار مارو اصلا ندیده", t: 27.1 }],
          [{ chord: "Bbm", text: "اونکه بدون من شبو یه لحظه خوابش نمیرفت", t: 32.18 }],
          [
            { chord: "Cm", text: "حالا دیگه کنار من نیست", t: 37.62 },
            { chord: "Cm", text: "میگن پیش آدم جدیده", t: 38.68 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [{ chord: "Fm", text: "واست چیو کم گذاشتم من که واست صد گذاشتم", t: 42.7 }],
          [{ chord: "Cm7", text: "زیاد من کم بود برات رو بود آخه هرچی داشتم", t: 47.48 }],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Bbm", text: "گفتم بمون درست میشه", t: 52.41 },
            { chord: "Bbm", text: "فکر نمیکردم که بغض میشه", t: 54.66 },
          ],
          [
            { chord: "Cm", text: "همه حرفام میمونه تو گلوم اون میاد میشینه درست پیشت", t: 57.52 },
            { chord: "Ab", text: "—", t: 60.7 },
          ],
        ],
      },
      {
        label: "تکرار همخوان",
        lines: [
          [{ chord: "Fm", text: "واست چیو کم گذاشتم من که واست صد گذاشتم", t: 63.11 }],
          [{ chord: "Cm7", text: "زیاد من کم بود برات رو بود آخه هرچی داشتم", t: 66.92 }],
        ],
      },
      {
        label: "تکرار بند دوم",
        lines: [
          [
            { chord: "Bbm", text: "گفتم بمون درست میشه", t: 72.82 },
            { chord: "Bbm", text: "فکر نمیکردم که بغض میشه", t: 74.58 },
          ],
          [{ chord: "Cm", text: "همه حرفام میمونه تو گلوم اون میاد میشینه درست پیشت", t: 78.41 }],
        ],
      },
      {
        label: "سولو گیتار",
        lines: [
          [
            { chord: "Fm", text: "سولو گیتار", t: 82.08 },
            { chord: "Cm", text: "—", t: 88.96 },
            { chord: "Bbm", text: "—", t: 94.39 },
            { chord: "Cm", text: "—", t: 98.68 },
          ],
        ],
      },
      {
        label: "پل",
        lines: [
          [
            { chord: "Fm", text: "شاید نرسه کوه به کوه", t: 104.42 },
            { chord: "Fm", text: "میرسه به آدم به آدم", t: 106.32 },
          ],
          [
            { chord: "Cm", text: "چیزایی یادت میدم که یادت ندادن", t: 109.23 },
            { chord: "Bbm", text: "تو گل بودی ولی اون خارت برا من", t: 113.52 },
          ],
          [
            { chord: "Cm", text: "—", t: 118.79 },
            { chord: "Cm", text: "—", t: 121.51 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [{ chord: "Fm", text: "واست چیو کم گذاشتم من که واست صد گذاشتم", t: 124.37 }],
          [{ chord: "Cm7", text: "زیاد من کم بود برات رو بود آخه هرچی داشتم", t: 129.66 }],
        ],
      },
      {
        label: "تکرار بند دوم",
        lines: [
          [
            { chord: "Bbm", text: "گفتم بمون درست میشه", t: 133.92 },
            { chord: "Bbm", text: "فکر نمیکردم که بغض میشه", t: 135.38 },
          ],
          [{ chord: "Cm", text: "همه حرفام میمونه تو گلوم اون میاد میشینه درست پیشت", t: 139.19 }],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [{ chord: "Fm", text: "واست چیو کم گذاشتم من که واست صد گذاشتم", t: 145.12 }],
          [{ chord: "Cm7", text: "زیاد من کم بود برات رو بود آخه هرچی داشتم", t: 149.37 }],
        ],
      },
      {
        label: "تکرار بند دوم",
        lines: [
          [
            { chord: "Bbm", text: "گفتم بمون درست میشه", t: 154.15 },
            { chord: "Bbm", text: "فکر نمیکردم که بغض میشه", t: 155.19 },
          ],
          [{ chord: "Cm", text: "همه حرفام میمونه تو گلوم اون میاد میشینه درست پیشت", t: 159.54 }],
        ],
      },
      {
        label: "پایان",
        lines: [
          [
            { chord: "Fm", text: "فید اوت", t: 163.84 },
            { chord: "Cm", text: "—", t: 169.92 },
            { chord: "Bbm", text: "—", t: 175.65 },
            { chord: "Fm", text: "—", t: 179.53 },
            { chord: "Cm", text: "—", t: 190.61 },
            { chord: "Cm", text: "تا آخر", t: 195.6 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:19",
      tempo: 123,
      key: "Fm",
      confidence: 68,
      sections: [
        { label: "A", time: "0:00 – 0:22", chords: ["Fm", "Cm", "Bbm", "Cm"] },
        { label: "B", time: "0:22 – 0:42", chords: ["Fm", "Cm", "Bbm"] },
        { label: "C", time: "0:42 – 1:22", chords: ["Fm", "Cm7", "Bbm", "Cm", "Ab"] },
        { label: "A", time: "1:22 – 1:44", chords: ["Fm", "Cm", "Bbm", "Cm"] },
        { label: "D", time: "1:44 – 2:04", chords: ["Fm", "Cm", "Bbm"] },
        { label: "C", time: "2:04 – 2:44", chords: ["Fm", "Cm7", "Bbm", "Cm", "Ab"] },
        { label: "A", time: "2:44 – 3:19", chords: ["Fm", "Cm", "Bbm"] },
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
      "آهنگی پاپ و دلنشین از امین قباد. گیتارکینگ برگه‌ی اکورد را از روی خودِ آهنگ نوشته و زمان هر بیت را با جداسازی صدا و متن رسمی تطبیق داده: گام لا مینور، تمپوی ۱۱۲ و چرخه‌ی بند Am – Em – F – G که در همخوان به چرخه‌ی Dm – G – Am می‌رسد. متن ترانه از رسانه آهنگ نقل شده (با ذکر منبع) و تکرارهای همخوان هم مثل خود آهنگ، دوبار نوشته شده است.",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Am", text: "بداهه", t: 0.53 },
            { chord: "Am", text: "تا ورود صدا", t: 4.55 },
            { chord: "Dm", text: "—", t: 9.9 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Am", text: "چه تفاهمی دوتایی میدیم به دست باد", t: 18.55 },
            { chord: "Em", text: "—", t: 23.51 },
            { chord: "Fmaj7", text: "تو موهاتو من خاطره هاتو وای", t: 25.55 },
          ],
          [
            { chord: "G", text: "چه تفاهمی دوتایی داریم", t: 33.32 },
            { chord: "Fmaj7", text: "چشم میبندیم", t: 37.53 },
            { chord: "Em", text: "—", t: 41.28 },
            { chord: "Fmaj7", text: "تو روی منو من رو هرکی غیر تو", t: 44.84 },
          ],
        ],
      },
      {
        label: "پیش‌همخوان",
        lines: [
          [
            { chord: "G", text: "یادته", t: 49.06 },
            { chord: "Am", text: "پیش هم هر شب", t: 52.1 },
            { chord: "Am", text: "خیره به آسمون میگفتی", t: 53.62 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "Dm", text: "عشقم نگاه کن اونه ستارمون", t: 56.66 },
            { chord: "G", text: "ستارمون کو ستارمون", t: 62.03 },
          ],
          [{ chord: "Am", text: "یادته با شادی پاک میکردیم اشکامونو از گونه مون", t: 64.43 }],
          [
            { chord: "Dm", text: "تو نباشی فرشته", t: 69.92 },
            { chord: "G", text: "ای نداره دیگه", t: 72.42 },
            { chord: "G", text: "بهشتمون بهشتمون", t: 75.06 },
            { chord: "F", text: "کو بهشتمون", t: 77.66 },
          ],
          [{ chord: "Dm", text: "کو بهشتمون کو بهشتمون …", t: 80.22 }],
        ],
      },
      {
        label: "سولو",
        lines: [
          [
            { chord: "G", text: "سولو", t: 84.61 },
            { chord: "Am", text: "—", t: 87.33 },
            { chord: "Dm", text: "—", t: 90.6 },
            { chord: "G", text: "—", t: 93.32 },
            { chord: "Am", text: "—", t: 96.06 },
            { chord: "Am", text: "—", t: 100.43 },
            { chord: "G", text: "—", t: 106.42 },
            { chord: "Am", text: "تا ورود بند دوم", t: 110.78 },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Am", text: "چه تفاهمی داریم دروغ میگیم", t: 114.08 },
            { chord: "Am", text: "دوتاییمون", t: 115.17 },
            { chord: "G", text: "—", t: 117.89 },
            { chord: "Em", text: "من به خودم", t: 121.7 },
            { chord: "Em", text: "تو به دوتاییمون", t: 123.88 },
          ],
          [
            { chord: "F", text: "چه تفاهمی هنوز که عاشقیم", t: 127.13 },
            { chord: "Am", text: "دوتاییمون", t: 130.4 },
            { chord: "Am", text: "—", t: 133.14 },
            { chord: "G", text: "من کجا برم", t: 136.42 },
            { chord: "G", text: "تا چشات میگه بمون", t: 139.13 },
          ],
        ],
      },
      {
        label: "پیش‌همخوان",
        lines: [
          [
            { chord: "G", text: "یادته", t: 147.33 },
            { chord: "Am", text: "پیش هم هر شب", t: 149.51 },
            { chord: "Am", text: "خیره به آسمون میگفتی", t: 150.6 },
          ],
        ],
      },
      {
        label: "همخوان پایانی",
        lines: [
          [
            { chord: "Dm", text: "عشقم نگاه کن اونه ستارمون", t: 153.88 },
            { chord: "G", text: "ستارمون کو ستارمون", t: 157.66 },
          ],
          [{ chord: "Am", text: "یادته با شادی پاک میکردیم اشکامونو از گونه مون", t: 161.52 }],
          [
            { chord: "Dm", text: "تو نباشی فرشته", t: 166.97 },
            { chord: "G", text: "ای نداره دیگه", t: 169.67 },
            { chord: "G", text: "بهشتمون بهشتمون", t: 171.87 },
            { chord: "F", text: "کو بهشتمون", t: 175.12 },
          ],
          [{ chord: "Dm", text: "کو بهشتمون کو بهشتمون …", t: 177.31 }],
        ],
      },
      {
        label: "پایان",
        lines: [
          [
            { chord: "Am", text: "فید اوت", t: 180.6 },
            { chord: "Dm", text: "—", t: 184.44 },
            { chord: "G", text: "—", t: 189.89 },
            { chord: "Am", text: "—", t: 195.86 },
            { chord: "G", text: "—", t: 201.87 },
            { chord: "Am", text: "تا آخر", t: 208.0 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:31",
      tempo: 112,
      key: "Am",
      confidence: 59,
      sections: [
        { label: "A", time: "0:00 – 0:18", chords: ["Am", "Dm"] },
        { label: "B", time: "0:18 – 0:49", chords: ["Am", "Em", "Fmaj7", "G"] },
        { label: "C", time: "0:49 – 0:56", chords: ["G", "Am"] },
        { label: "D", time: "0:56 – 1:24", chords: ["Dm", "G", "Am", "F"] },
        { label: "E", time: "1:24 – 1:53", chords: ["G", "Am", "Dm"] },
        { label: "B", time: "1:53 – 2:27", chords: ["Am", "G", "Em", "F"] },
        { label: "C", time: "2:27 – 2:33", chords: ["G", "Am"] },
        { label: "D", time: "2:33 – 3:00", chords: ["Dm", "G", "Am", "F"] },
        { label: "A", time: "3:00 – 3:31", chords: ["Am", "Dm", "G"] },
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
