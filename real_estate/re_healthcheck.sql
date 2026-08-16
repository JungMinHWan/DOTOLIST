-- ============================================================
-- Real Estate Signals — 배치 실행 후 건강검진 쿼리 (읽기 전용)
-- Supabase SQL Editor 에 붙여넣고 실행하세요. 데이터를 변경하지 않습니다.
-- ============================================================

-- [1] 종합 상태
SELECT * FROM (
  SELECT 1 AS n, '총 신호 수' AS 항목, count(*)::text AS 값 FROM re_signals
  UNION ALL SELECT 2, '신호가 있는 구 (25 여야 정상)', count(DISTINCT gu)::text FROM re_signals
  UNION ALL SELECT 3, '30점 이상 (실제 주목 대상)', count(*)::text FROM re_signals WHERE score >= 30
  UNION ALL SELECT 4, '⚠️ 빈 단지키 (0 이어야 정상)', count(*)::text FROM re_signals WHERE complex_key LIKE '%|'
  UNION ALL SELECT 5, '⚠️ 키 조각수 오류 (0 이어야 정상)', count(*)::text
         FROM re_signals WHERE array_length(string_to_array(complex_key,'|'),1) <> 3
  UNION ALL SELECT 6, '같은지번 건물분리 검증 (성수동834)',
         COALESCE(string_agg(DISTINCT apt_name,' + '),'(해당없음)')
         FROM re_signals WHERE complex_key LIKE '11200|834|%'
) t ORDER BY n;


-- [2] 구별 신호 수 — 0건인 구가 있으면 그 구만 문제가 있는 것입니다.
-- SELECT gu, count(*) AS 신호수, count(*) FILTER (WHERE score >= 30) AS 주목대상
-- FROM re_signals GROUP BY gu ORDER BY 2 DESC;


-- [3] 상위 신호 미리보기
-- SELECT gu, dong, apt_name, pyeong AS 평, score AS 점수,
--        latest_amount AS 최근가, baseline_amount AS 기준가,
--        ROUND(drop_rate*100,1) AS 하락률, sample_size AS 표본, flags
-- FROM re_signals ORDER BY score DESC, drop_rate DESC LIMIT 20;


-- [4] 상세 조회 정상 동작 확인 — 단지명과 전용면적이 한 종류만 나와야 정상
-- WITH t AS (SELECT complex_key, area_bucket FROM re_signals ORDER BY score DESC LIMIT 1)
-- SELECT DISTINCT h.apt_name, ROUND(h.area) AS 전용, count(*) OVER () AS 총건수
-- FROM t, re_get_deal_history(t.complex_key, t.area_bucket) h;
