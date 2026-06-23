const fs = require('fs');
const path = require('path');

// 헬퍼 함수: 단일 객체 또는 배열을 일관되게 배열로 반환
function toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return [obj];
}

// 헬퍼 함수: feat 구조에서 특정 속성의 값(val) 추출
function getFeatValue(featContainer, attName) {
  if (!featContainer) return null;
  const feats = toArray(featContainer);
  const found = feats.find(f => f && f.att === attName);
  return found ? found.val : null;
}

// 헬퍼 함수: feat 구조에서 특정 속성이 특정 값을 가지는지 체크
function hasFeatValue(featContainer, attName, targetVal) {
  return getFeatValue(featContainer, attName) === targetVal;
}

// 추출 스크립트 메인 로직
function extractWords() {
  const dictionaryDir = __dirname;
  const files = fs.readdirSync(dictionaryDir).filter(file => file.endsWith('.json') && file !== 'quiz_words.json');
  
  console.log(`발견된 사전 파일 개수: ${files.length}개`);
  
  const allExtractedWords = [];
  const targetWordCountPerFile = 250; // 파일당 최대 추출 개수 (총 약 2,750개)

  for (const file of files) {
    const filePath = path.join(dictionaryDir, file);
    console.log(`파싱 시작: ${file}...`);
    
    try {
      const rawData = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(rawData);
      
      const entries = toArray(data?.LexicalResource?.Lexicon?.LexicalEntry);
      const fileExtracted = [];
      
      for (const entry of entries) {
        // 1. 표제어 추출 및 검증
        const word = entry.Lemma?.feat ? getFeatValue(entry.Lemma.feat, 'writtenForm') : null;
        if (!word) continue;
        
        // 2글자 이상 5글자 이하의 한글 단어만 선택 (접사 '-' 나 특수문자 포함 제외)
        const isKoreanOnly = /^[가-힣]{2,5}$/.test(word);
        if (!isKoreanOnly) continue;
        
        // 2. 품사 및 어휘 레벨 확인
        const entryFeats = entry.feat;
        const pos = getFeatValue(entryFeats, 'partOfSpeech'); // 명사, 동사, 형용사, 부사 등
        const level = getFeatValue(entryFeats, 'vocabularyLevel'); // 초급, 중급, 고급
        
        // 주요 품사 필터링
        const validPos = ['명사', '동사', '형용사', '부사', '대명사', '수사', '관형사'];
        if (!pos || !validPos.includes(pos)) continue;
        if (!level || !['초급', '중급', '고급'].includes(level)) continue;
        
        // 3. 뜻풀이 및 예문 추출
        const senses = toArray(entry.Sense);
        let bestDefinition = null;
        const sentenceExamples = [];
        
        for (const sense of senses) {
          // 한국어 뜻풀이 추출
          const definition = getFeatValue(sense.feat, 'definition');
          if (definition && !bestDefinition) {
            bestDefinition = definition;
          }
          
          // 예시 문장 추출 (type이 '문장'인 것)
          const examples = toArray(sense.SenseExample);
          for (const ex of examples) {
            const exFeats = ex.feat;
            const isSentence = hasFeatValue(exFeats, 'type', '문장');
            const exText = getFeatValue(exFeats, 'example');
            
            if (isSentence && exText) {
              // 중복 예문 방지 및 너무 긴 예문 제외(100자 이하)
              if (!sentenceExamples.includes(exText) && exText.length <= 100) {
                sentenceExamples.push(exText);
              }
            }
          }
        }
        
        // 뜻풀이가 있고 예문이 최소 2개 이상 있는 단어만 최종 선택
        if (bestDefinition && sentenceExamples.length >= 2) {
          // 예문 최대 3개까지만 제한하여 용량 축소
          const limitedExamples = sentenceExamples.slice(0, 3);
          
          fileExtracted.push({
            w: word,              // 표제어
            d: bestDefinition,    // 뜻풀이
            p: pos,               // 품사
            l: level,             // 레벨 (난이도)
            e: limitedExamples    // 예시 문장 배열
          });
        }
      }
      
      // 파일별로 단어를 무작위로 섞어서 일부만 추출 (다양성 확보)
      const shuffled = fileExtracted.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, targetWordCountPerFile);
      
      allExtractedWords.push(...selected);
      console.log(`-> ${file}에서 조건 충족 단어 ${fileExtracted.length}개 중 ${selected.length}개 추출 완료.`);
      
    } catch (err) {
      console.error(`파일 처리 오류 [${file}]:`, err);
    }
  }
  
  // 전체 추출 결과 파일로 저장
  const outputPath = path.join(dictionaryDir, 'quiz_words.json');
  fs.writeFileSync(outputPath, JSON.stringify(allExtractedWords, null, 2), 'utf8');
  
  console.log(`\n========================================`);
  console.log(`추출 완료! 총 단어 개수: ${allExtractedWords.length}개`);
  console.log(`출력 파일: ${outputPath}`);
  console.log(`========================================`);
}

extractWords();
