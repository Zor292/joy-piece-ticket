module.exports = {
  TICKET_CATEGORY_ID: '1478142994627559495',
  LOG_CHANNEL_ID: '1478010530785529856',
  IMAGE_URL: 'https://media.discordapp.net/attachments/1407735667181621290/1477918864435183860/CAC31DCA-3DC7-4D5C-80A0-3B3972978129.jpg?ex=69a72b73&is=69a5d9f3&hm=1bb22c52b9030281d6c600f08710ee096ca6a3cd5ce73fdd01287520e4e56860&=&format=webp&width=1386&height=779',
  EMBED_COLOR: 0x7b2dff,
  PREFIX: '!',

  ROLES: {
    SENIOR: '1313900532707885167',
    SUPPORT: '1313877058891419658',
  },

  TICKET_TYPES: {
    tech: {
      label: 'الدعم الفني',
      emoji: '🔧',
      adminRole: '1314577351660797993',
      title: 'مرحبا بك في الدعم الفني الخاص بـ JoyPiece',
      supportRole: '1313877058891419658',
      desc: 'للمشاكل التقنية والأسئلة العامة',
    },
    purchase: {
      label: 'تكت شراء',
      emoji: '🛒',
      adminRole: '1313900532707885167',
      title: 'مرحبا بك في تكت الشراء في JoyPiece',
      supportRole: '1313900532707885167',
      desc: 'للاستفسار عن المنتجات والطلبات',
    },
    complaint: {
      label: 'تكت شكوى',
      emoji: '📢',
      adminRole: '1314577351660797993',
      title: 'مرحبا بك في تكت الشكوى في JoyPiece',
      supportRole: '1314577351660797993',
      desc: 'لتقديم شكوى ضد عضو أو إداري',
    },
    compensation: {
      label: 'تكت تعويض',
      emoji: '💰',
      adminRole: '1367933550263009390',
      title: 'مرحبا بك في تكت التعويض في JoyPiece',
      supportRole: '1367933550263009390',
      desc: 'لطلب تعويض أو استرداد',
    },
    programming: {
      label: 'طاقم البرمجة',
      emoji: '💻',
      adminRole: '1361347119331676220',
      title: 'مرحبا بك في تكت طاقم البرمجة في JoyPiece',
      supportRole: '1361347119331676220',
      desc: 'للتواصل مع طاقم البرمجة',
    },
  },

  MAIN_TICKETS: ['tech', 'purchase', 'complaint', 'compensation'],
  EXTRA_TICKETS: ['programming'],

  RULES_DESCRIPTION: `**احترام الفريق الاداري :**
يرجى التعامل باحترام مع اي عضو من طاقم الاداره او الدعم

**MD_Warning: لانفتح تكيت بدون سبب واضح :**
التكت مخصص للمشاكل الحقيقية او الطلبات الجاده فقط، اي تكيت بدون سبب مقنع سيتم اغلاقه فورا

**ممنوع السب او الاهانة :**
اي اساءة لفظية داخل التكيت تعرضك للعقوبة او الباند

**التكت ليس للمزاح او الطقطقه:**
عدم تكرار فتح التكت لنفس المشكله`,
};
