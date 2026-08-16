import crypto from 'crypto';

export const GU_MAP = {
  '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구', '11215': '광진구',
  '11230': '동대문구', '11260': '중랑구', '11290': '성북구', '11305': '강북구', '11320': '도봉구',
  '11350': '노원구', '11380': '은평구', '11410': '서대문구', '11440': '마포구', '11470': '양천구',
  '11500': '강서구', '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
  '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구', '11740': '강동구'
};

export function parseXmlItems(xmlString, lawdCd, dealYmd) {
  const items = [];
  const itemMatches = xmlString.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemXml of itemMatches) {
    const getVal = (tag) => {
      const match = itemXml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
      if (!match) return null;
      const v = match[1].trim();
      return v === '' ? null : v;
    };

    const aptNm = getVal('aptNm') || getVal('aptName') || '';
    const jibun = getVal('jibun') || '';
    const umdNm = getVal('umdNm') || getVal('dong') || '';
    const sggCd = getVal('sggCd') || lawdCd;
    const excluUseAr = parseFloat(getVal('excluUseAr') || '0');
    const areaBucket = Math.round(excluUseAr);
    const floorStr = getVal('floor') || '0';
    const floor = parseInt(floorStr, 10);
    const buildYearStr = getVal('buildYear');
    const buildYear = buildYearStr ? parseInt(buildYearStr, 10) : null;

    const dealYear = getVal('dealYear') || dealYmd.substring(0, 4);
    const dealMonthStr = getVal('dealMonth') || dealYmd.substring(4, 6);
    const dealMonth = dealMonthStr.padStart(2, '0');
    const dealDayStr = getVal('dealDay') || '1';
    const dealDay = dealDayStr.padStart(2, '0');
    const dealDate = `${dealYear}-${dealMonth}-${dealDay}`;

    const amountStr = getVal('dealAmount') || '0';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10);

    const dealingGbn = getVal('dealingGbn') || getVal('dealingType');
    const cdealType = getVal('cdealType');
    const isCanceled = cdealType === 'O';
    const cdealDayRaw = getVal('cdealDay');
    let canceledAt = null;
    if (cdealDayRaw) {
      canceledAt = formatShortDate(cdealDayRaw, dealYear);
    }

    const rgstDateRaw = getVal('rgstDate');
    let registeredAt = null;
    if (rgstDateRaw) {
      registeredAt = formatShortDate(rgstDateRaw, dealYear);
    }

    const aptDong = getVal('aptDong');
    const sellerType = getVal('slerGbn');
    const buyerType = getVal('buyerGbn');
    const agentSgg = getVal('estateAgentSggNm');

    const guName = GU_MAP[sggCd] || '서울시';

    // deal_key 생성 (SHA1 해시)
    const rawKey = `${sggCd}_${jibun}_${excluUseAr}_${floor}_${dealDate}_${amount}`;
    const dealKey = crypto.createHash('sha1').update(rawKey).digest('hex');

    items.push({
      deal_key: dealKey,
      lawd_cd: sggCd,
      gu: guName,
      dong: umdNm,
      jibun: jibun,
      apt_name: aptNm,
      area: excluUseAr,
      area_bucket: areaBucket,
      floor: floor,
      build_year: buildYear,
      deal_date: dealDate,
      amount: amount,
      dealing_type: dealingGbn,
      is_canceled: isCanceled,
      canceled_at: canceledAt,
      registered_at: registeredAt,
      apt_dong: aptDong,
      seller_type: sellerType,
      buyer_type: buyerType,
      agent_sgg: agentSgg,
      raw_cdeal_type: cdealType
    });
  }

  return items;
}

function formatShortDate(dateStr, defaultYear) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\s+/g, '');
  if (!cleaned) return null;

  const parts = cleaned.split('.');
  if (parts.length === 3) {
    let year = parts[0];
    if (year.length === 2) year = '20' + year;
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else if (parts.length === 2) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    return `${defaultYear}-${month}-${day}`;
  }
  return null;
}
