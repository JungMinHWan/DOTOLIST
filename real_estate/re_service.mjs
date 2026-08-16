import { parseXmlItems, GU_MAP } from './re_parser.mjs';

/**
 * GU_MAP 재수출.
 * netlify/functions/re_collector.mjs 와 re_scheduled_collector.mjs 가
 *   import { collectAndSaveSingleMonth, GU_MAP } from '../../real_estate/re_service.mjs'
 * 형태로 가져오는데, 정작 이 모듈이 GU_MAP 을 내보내지 않아
 * esbuild 번들 단계에서 "No matching export ... for import GU_MAP" 로
 * Netlify 빌드 전체가 exit code 2 로 실패했습니다.
 */
export { GU_MAP };

/**
 * 국토교통부 실거래가 API 호출 (CORS 차단 방지 및 serviceKey 보안 관리용)
 */
export async function fetchPublicDataTrade(lawdCd, dealYmd, serviceKey) {
  if (!serviceKey) {
    throw new Error('serviceKey(PUBLIC_DATA_API_KEY)가 설정되지 않았습니다.');
  }

  // serviceKey 인코딩 안전 처리
  const encodedKey = serviceKey.includes('%') ? serviceKey : encodeURIComponent(serviceKey);
  const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${encodedKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=1000&pageNo=1`;

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/xml, text/xml',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP Error ${res.status} (LAWD_CD: ${lawdCd}, DEAL_YMD: ${dealYmd})`);
  }

  const xmlText = await res.text();
  return xmlText;
}

/**
 * Supabase REST API를 통한 deals & complexes Upsert
 */
export async function saveDealsToSupabase(deals, supabaseUrl, serviceRoleKey) {
  if (!deals || deals.length === 0) {
    return { upsertedDealsCount: 0, upsertedComplexesCount: 0, duplicatesCount: 0 };
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  }

  // 1. re_deals Upsert (resolution=merge-duplicates)
  // cdealType, rgstDate, aptDong 등 업데이트 반영
  const dealsEndpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/re_deals`;
  
  // payload 파싱 (raw_cdeal_type 제거)
  const dealsPayload = deals.map(d => {
    const { raw_cdeal_type, ...rest } = d;
    return rest;
  });

  const dealsRes = await fetch(dealsEndpoint, {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates, return=minimal'
    },
    body: JSON.stringify(dealsPayload)
  });

  if (!dealsRes.ok) {
    const errText = await dealsRes.text();
    throw new Error(`Supabase re_deals Upsert Error [${dealsRes.status}]: ${errText}`);
  }

  // 2. re_complexes Upsert (지번 기준 단지 마스터)
  const complexMap = new Map();
  for (const d of deals) {
    if (!d.jibun) continue;
    const complexKey = `${d.lawd_cd}|${d.jibun}`;
    if (!complexMap.has(complexKey)) {
      complexMap.set(complexKey, {
        complex_key: complexKey,
        lawd_cd: d.lawd_cd,
        gu: d.gu,
        dong: d.dong,
        jibun: d.jibun,
        display_name: d.apt_name
      });
    }
  }

  const complexesPayload = Array.from(complexMap.values());
  let upsertedComplexesCount = 0;

  if (complexesPayload.length > 0) {
    const complexesEndpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/re_complexes`;
    const complexesRes = await fetch(complexesEndpoint, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates, return=minimal'
      },
      body: JSON.stringify(complexesPayload)
    });

    if (complexesRes.ok) {
      upsertedComplexesCount = complexesPayload.length;
    }
  }

  return {
    upsertedDealsCount: deals.length,
    upsertedComplexesCount: upsertedComplexesCount
  };
}

/**
 * 단일 구 + 단일 월 수집 및 적재 실행 파이프라인
 */
export async function collectAndSaveSingleMonth(lawdCd, dealYmd, serviceKey, supabaseUrl, serviceRoleKey) {
  const xmlText = await fetchPublicDataTrade(lawdCd, dealYmd, serviceKey);
  const deals = parseXmlItems(xmlText, lawdCd, dealYmd);
  
  if (deals.length === 0) {
    return {
      lawd_cd: lawdCd,
      deal_ymd: dealYmd,
      total_count: 0,
      upserted: 0
    };
  }

  const saveRes = await saveDealsToSupabase(deals, supabaseUrl, serviceRoleKey);
  return {
    lawd_cd: lawdCd,
    deal_ymd: dealYmd,
    total_count: deals.length,
    upserted: saveRes.upsertedDealsCount,
    deals: deals
  };
}
