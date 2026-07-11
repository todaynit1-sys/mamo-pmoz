// Vercel 서버리스 함수 — 에어코리아 API를 서버에서 대신 호출해 CORS 없이 반환합니다.
// 배포 방법: 이 파일을 저장소의  api/airkorea.js  경로에 두면 Vercel이 자동으로
//            https://<your-app>.vercel.app/api/airkorea  엔드포인트로 서빙합니다.
// (별도 설정/빌드 불필요. Node.js 18+ 런타임의 전역 fetch 사용)

const SERVICE_KEY =
  process.env.AIRKOREA_KEY ||
  '22fc2cb3f16889484fe4525e397c7f90fb651bee6d21960ef484b04936d5dc8d';

const ENDPOINT =
  'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty';

export default async function handler(req, res) {
  const stationName = (req.query.stationName || '').toString().trim();
  const dataTerm = (req.query.dataTerm || 'DAILY').toString().trim();

  // 프리플라이트/CORS 허용(같은 도메인이면 필요 없지만 안전하게)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!stationName) {
    res.status(400).json({ error: 'stationName 파라미터가 필요합니다.' });
    return;
  }

  const params = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    returnType: 'json',
    numOfRows: dataTerm === 'DAILY' ? '48' : '2400',
    pageNo: '1',
    stationName,
    dataTerm,
    ver: '1.3',
  });

  const url = ENDPOINT + '?' + params.toString();

  try {
    // 서버 측 호출 → CORS 무관, 빠름
    const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await upstream.text();

    // 동일 측정소·시점 응답은 잠시 CDN 캐싱(반복 조회 가속)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    try {
      // 정상 JSON이면 그대로 파싱해 반환
      const json = JSON.parse(text);
      res.status(200).json(json);
    } catch (_) {
      // 공공데이터포털이 XML 에러(예: 키 오류/한도초과)를 줄 때가 있음 → 원문 그대로
      res.status(502).json({ error: 'upstream_non_json', raw: text.slice(0, 500) });
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream_fetch_failed', detail: String(e) });
  }
}
