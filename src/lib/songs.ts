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
      "ترانه‌ی تازه‌ی رامین بی باک. برگه‌ی اکورد را گیتارکینگ از روی خودِ آهنگ شنیده و نوشته: گام فا مینور، تمپوی ۱۲۳ و چرخه‌ی همیشگی Fm – Cm – Bbm – Cm. متن و فایل صوتی از رزمیوزیک آمده (با ذکر منبع).",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Fm", text: "بداهه‌ی گیتار", t: 1.5 },
            { chord: "Cm", text: "چرخه‌ی اصلی", t: 6.1 },
            { chord: "Bbm", text: "تا ورود صدا", t: 11.2 },
            { chord: "Cm", text: "تکرار چرخه", t: 16.1 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Eb", text: "یهو شدم واست غریبه", t: 29.6 },
            { chord: "Bbm", text: "کارای تو واقعا عجیبه", t: 31.9 },
          ],
          [
            { chord: "Gm", text: "اون چشای آدم فریبت", t: 37.1 },
            { chord: "Eb", text: "انگار مارو اصلا ندیده", t: 41.5 },
          ],
          [
            { chord: "Fm7", text: "اونکه بدون من شبو یه لحظه", t: 45.1 },
            { chord: "Cm", text: "خوابش نمیرفت", t: 47.6 },
          ],
          [
            { chord: "Bbm", text: "حالا دیگه کنار من نیست", t: 51.5 },
            { chord: "Ab", text: "میگن پیش آدم جدیده", t: 58.9 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "Fm", text: "واست چیو کم گذاشتم", t: 62.7 },
            { chord: "Cm", text: "من که واست صد گذاشتم", t: 66.8 },
          ],
          [
            { chord: "Bbm", text: "زیاد من کم بود برات", t: 72.3 },
            { chord: "Ab", text: "رو بود آخه هرچی داشتم", t: 78.8 },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "Fm", text: "گفتم بمون درست میشه", t: 104.5 },
            { chord: "Cm", text: "فکر نمیکردم که بغض میشه", t: 108.3 },
          ],
          [
            { chord: "Bbm", text: "همه حرفام میمونه تو گلوم", t: 113.6 },
            { chord: "Cm", text: "اون میاد میشینه درست پیشت", t: 118.7 },
          ],
        ],
      },
      {
        label: "پل",
        lines: [
          [
            { chord: "Bbm", text: "شاید نرسه کوه به کوه", t: 133.7 },
            { chord: "Cm", text: "میرسه به آدم به آدم", t: 139.6 },
          ],
          [
            { chord: "Bbm", text: "چیزایی یادت میدم که یادت ندادن", t: 154.1 },
            { chord: "Eb", text: "تو گل بودی ولی اون خارت برا من", t: 159.4 },
          ],
        ],
      },
      {
        label: "پایان",
        lines: [
          [
            { chord: "Fm", text: "فید اوت پایانی", t: 185.3 },
            { chord: "Cm", text: "تا آخر", t: 190.7 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:19",
      tempo: 123,
      key: "Fm",
      confidence: 57.8,
      sections: [
        { label: "A", time: "0:00 – 0:29", chords: ["Fm", "Cm", "Bbm", "Cm"] },
        { label: "A", time: "0:29 – 0:48", chords: ["Eb", "Bbm", "Gm", "Fm7"] },
        { label: "A", time: "0:48 – 1:02", chords: ["Fm7", "Cm", "Bbm", "Ab"] },
        { label: "A", time: "1:02 – 2:02", chords: ["Fm", "Cm", "Bbm", "Ab", "Eb"] },
        { label: "A", time: "2:02 – 3:05", chords: ["Eb", "Fm", "Ab", "Cm", "Bbm"] },
        { label: "A", time: "3:05 – 3:19", chords: ["Fm", "Cm"] },
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
    description:
      "آهنگی پاپ و دلنشین از امین قباد. برگه‌ی اکورد این ترانه کاملاً با گیتارکینگ شنیده و نوشته شده: کلید لا مینور، تمپوی ۱۱۲ و چهار بخش ساختاری.",
    sections: [
      {
        label: "اینترو",
        lines: [
          [
            { chord: "Am", text: "بداهه‌ی گیتار", t: 0 },
            { chord: "Am", text: "۰:۰۰ تا ۰:۰۹", t: 4.5 },
          ],
        ],
      },
      {
        label: "بند اول",
        lines: [
          [
            { chord: "Am", text: "شب از نیمه گذشت", t: 17 },
            { chord: "Dm", text: "و تو هنوز", t: 37.4 },
            { chord: "G", text: "تو راهی", t: 60.6 },
          ],
          [
            { chord: "Em", text: "می‌گم برگرد", t: 78.2 },
            { chord: "Am", text: "به اولِ خاطره‌ها", t: 97.7 },
          ],
        ],
      },
      {
        label: "همخوان",
        lines: [
          [
            { chord: "F", text: "کو بهشتمون", t: 114.4 },
            { chord: "G", text: "تو کوچه‌های این شهر", t: 123.3 },
          ],
          [
            { chord: "C", text: "جایی میان", t: 132.1 },
            { chord: "Am", text: "غم‌های بی‌بهانه", t: 136.5 },
          ],
        ],
      },
      {
        label: "بند دوم",
        lines: [
          [
            { chord: "F", text: "باز این کوچه", t: 147.3 },
            { chord: "Dm", text: "پر از صدای", t: 151.7 },
            { chord: "G", text: "قدم‌های تو شد", t: 171.1 },
          ],
          [
            { chord: "F", text: "و گیتار من", t: 175.4 },
            { chord: "Em", text: "باز نام تو را", t: 192.9 },
            { chord: "Am", text: "می‌خواند", t: 206 },
          ],
        ],
      },
    ],
    bot: {
      duration: "3:31",
      tempo: 112,
      key: "Am",
      confidence: 58.9,
      sections: [
        { label: "A", time: "0:00 – 0:09", chords: ["Am", "Dm"] },
        {
          label: "B",
          time: "0:09 – 1:51",
          chords: ["Dm", "G", "Em", "F", "C", "Am"],
        },
        { label: "B", time: "1:51 – 2:21", chords: ["Am", "G", "Em", "C", "F"] },
        { label: "B", time: "2:21 – 3:31", chords: ["C", "G", "F", "Am", "Dm", "Em"] },
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
