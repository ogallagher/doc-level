# doc-level • 독해수준

Analyze/profile texts to estimate reading level. 

Implemented by integrating OpenAI API language models with automated fetch and parse of source texts, structured prompting, and organization of results as a local library.

# Supported profile attributes

- Reading difficulty[독해수준], as recommended years of education in order for a native speaker to understand the text.
- Maturity, being reader recommended maturity level.
- Ideologies, political bias.
- Topics, genres, categories.

<details>
<summary>Most <code>TextProfile</code> attributes</summary>

OpenAI model = `chat.completions`

General purpose natural language prompts. Input can be a combination of:

1. `role=developer` Contextual directions that take precendence over user directives.
1. `role=assistant` Past responses by the language model/assistant.
2. `role=user` Past and present prompts/queries by the user.

For app integration, passing a JSON object schema to `response_format` ensures the response can be easily parsed.
</details>

<details>
<summary><code>TextProfile.maturity</code> implementation</summary>

OpenAI model = `moderations`

This looks for offensive markers in text and images, from the categories listed below. It does not appear to flag curse words. It does work for multilingual input, as do all other endpoints that take text input.

```txt
"sexual","hate","harassment","self-harm","sexual/minors","hate/threatening",
"violence/graphic","self-harm/intent","self-harm/instructions",
"harassment/threatening","violence"
```

The ouput of `moderations` is then combined with a prompt of `chat.completions` to look for other custom offenses like profanity/curses.
</details>

# Pending profile attributes

- Novelty of vocabulary (archaic vs neologistic language).
- Other suggestions?

# Samples showcase

## 문장웹진 / 소설

`page-1/index.json`

```json
[
  {
    "authorName": "권여선",
    "title": "문상",
    "publishDate": "2005-05-13T00:00:00.000Z",
    "viewCount": 6897,
    "url": "https://munjang.or.kr/board.es?mid=a20103000000&bid=0003&act=view&ord=B&list_no=1629&nPage=1&c_page=",
    "excerpts": [
      "권여선   1  그날 아침에 비가 왔다는 얘기부터 하자. 어둡고 습도가 높아 그는 오랜만에 푹 잘 수 있었다. 더 이상 자고 싶지 않을 만큼 잔 후에야 그는 천천히 몸을 일으켜 침대에 걸터앉은 채로 어두운 방 안을 둘러보았다. 좋다,고 생각했다. 전자레인지에 한약을 데워 먹은 후 이메일을 확인했다. 시원한 생수를 들이켜고 싶었지만 대신 미지근한 보리차로 입안을 헹궜다. 한의사가 찬 음료와 날음식은 당분간 피하는 게 좋다고 말했다. 담배를 한 모금 피워 물자 혀끝에 남은 감초맛에 쌉싸름한 담배 연기가 섞였다. 한의사는 술과 담배에 관해서는 언급하지 않았다... 마치 입술이 있어야 할 자리에 발톱이 덜 여문 갓난아기 발가락 두 개가 붙어 있는"
    ],
    "id": "1629"
  }
]
```

<details>
<summary>
<code>story-1629/권여선_문상_excerpt.txt.profile.json</code> (analysis from excerpt of 3000 char)
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 16,
    "readingLevelName": "graduate",
    "reasons": [
      "Complex vocabulary with specialized terms and phrases",
      "Multi-layered narrative structure",
      "Use of figurative language and metaphor",
      "Themes of existential angst and societal reflection",
      "Dialogue that requires inferencing and contextual understanding",
      "Subtle emotional and psychological undertones",
      "Culturally nuanced references and idiomatic expressions",
      "Non-linear progression of ideas",
      "Ambiguity in character motivations and intentions",
      "Diverse sentence structures with varied lengths and complexities."
    ],
    "difficultWords": [
      "습도",
      "감초맛",
      "외설",
      "잔혹한",
      "변명",
      "미숙한",
      "노골적인",
      "구박",
      "문상객",
      "부지런히",
      "타전한",
      "구호",
      "묶되",
      "혼돈",
      "파열",
      "특히",
      "미지근한"
    ],
    "difficultPhrases": [
      "그녀의 뜻 없는 눈동자와 기계적으로 달싹거리는 입술은 그에게 외설 이상이었다.",
      "그는 다시 한 번 좋다,고 생각했다.",
      "죄의식 때문에 알고 싶은데 외면하게 된 것도 있겠고, 그저 모르는 채로 살다 잊은 것도 있겠다.",
      "이 느낌은 결코 좋다고는 할 수 없었다.",
      "그녀가 낙석처럼 다시 왔다는 것."
    ]
  },
  "topics": [
    {
      "id": "mental-health",
      "examplePhrases": [
        "오랜만에 푹 잘 수 있었다",
        "모름의 한가운데는 늘 죄의식이 도사리고 있었다",
        "격분하여 그녀의 말을 잘랐다",
        "그의 태도는 공격보다 방어였는지 모른다",
        "극도의 혼돈과 파열을 바라는 게 아닐까 하는 생각을 했다"
      ]
    },
    {
      "id": "relationships",
      "examplePhrases": [
        "그녀의 뜻 없는 눈동자와 기계적으로 달싹거리는 입술은 그에게 외설 이상이었다",
        "자기만의 마이크를 내장하고 있는 사람",
        "형태가 잘룩했고, 상의로 가려",
        "그녀의 전화 한 통으로 살금살금 살아온 지난 3년의 세월이 유리처럼 부서져",
        "그럼에도 불구하고 지금 사내 앞에 놓인 분명한 사태란 이것이다"
      ]
    },
    {
      "id": "addiction",
      "examplePhrases": [
        "한의사가 술과 담배에 관해서는 언급하지 않았다",
        "담배를 한 모금 피워 물자",
        "그녀는 젖어 있지 않았다",
        "그의 인생에서 다시는 그녀 같은 여자와 조우하고 싶지 않았다",
        "짧게 속이 부풀어진 담배"
      ]
    },
    {
      "id": "identity",
      "examplePhrases": [
        "쏜살같이 날아오는 콩",
        "이제 그에게 어떤 느낌이든 좋다, 싫다로 양분되는 일은 없을 것이다",
        "그녀는 갑자기 걸음을 멈추더니 그를 돌아보았다",
        "선배님이 날 꼬신 거야",
        "누구한테 배운 거죠?"
      ]
    },
    {
      "id": "society",
      "examplePhrases": [
        "강사도 하나의 권력이라면",
        "그때나 지금이나 대상의 의미를 모른다는 건 그에게 항상 창피하고 꺼림칙한 느낌을 주었다",
        "기도하는 것만 남았다",
        "그들은 주로 남성들이었다",
        "군대를 가봤어야 이해를 하지"
      ]
    },
    {
      "id": "nostalgia",
      "examplePhrases": [
        "지난밤 그는 여관방에 들어서자마자",
        "그렇고 그런 이야기는 전부 지난 이야기다",
        "작년의 일이 마치 어제의 일이듯",
        "어떤 느낌이든 좋다, 싫다로 양분되는 일은 없을 것이다",
        "살금살금 살아온 지난 3년의 세월"
      ]
    }
  ]
}
```
</details>

## El País / Opinión / Columnas

`page-0/index.json`

```json
[
  {
    "authorName": "Jorge Morla",
    "title": "El día en que Nintendo demandó a una tienda de Costa Rica por llamarse Súper Mario. Y perdió la batalla",
    "publishDate": "2025-02-03T02:52:00.000Z",
    "viewCount": -1,
    "url": "https://elpais.com/babelia/2025-02-03/el-dia-en-que-nintendo-demando-a-una-tienda-de-costa-rica-por-llamarse-super-mario-y-perdio-la-batalla.html",
    "excerpts": [
      "El excesivo celo de las compañías al proteger sus propiedades intelectuales a veces torpedea el avance creativo del medio digital"
    ],
    "id": "el-dia-en-que-nintendo-demando-a-una-tienda-de-costa-rica-por-llamarse-super-mario-y-perdio-la-batalla"
  },
  {
    "authorName": "Vanessa Romero Rocha",
    "title": "Obrador: el mensaje en la botella",
    "publishDate": "2025-02-02T17:39:44.000Z",
    "viewCount": -1,
    "url": "https://elpais.com/mexico/opinion/2025-02-02/obrador-el-mensaje-en-la-botella.html",
    "excerpts": [
      "El expresidente dejó una especie de manual para tratar al mandatario naranja, una brújula que resiste el paso del tiempo"
    ],
    "id": "obrador-el-mensaje-en-la-botella"
  }
]
```

<details>
<summary>
<code>story-obrador-el-mensaje-en-la-botella/Jorge-Morla_..._excerpt.txt.profile.json</code> (analysis from excerpt of 3000 char)
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 14,
    "readingLevelName": "undergraduate",
    "reasons": [
      "Complex sentence structures that may confuse novice readers.",
      "Use of political terminology and references that require background knowledge.",
      "Inclusion of culturally specific references pertinent to Mexican politics.",
      "Use of metaphorical language that may not be easily understood by all readers.",
      "Presence of advanced vocabulary that might not be familiar to all readers.",
      "Associations with historical events and figures that may require additional context.",
      "Dialogue that reflects a deep understanding of political nuance and rhetoric.",
      "Implicit meanings and subtext in the characters' statements.",
      "Interruption of narrative flow with parenthetical remarks and editorializing offers complications in comprehension.",
      "Cohesion is reliant on knowledge of current events related to U.S.-Mexico relations."
    ],
    "difficultWords": [
      "inusual",
      "presidencia",
      "insólito",
      "contingente",
      "pronosticaba",
      "geografía",
      "consigna",
      "intersección",
      "calumnia",
      "renacer",
      "tarifaria",
      "subordinación",
      "gelatinoso",
      "irrefutable",
      "manipulación",
      "presencia",
      "agravio"
    ],
    "difficultPhrases": [
      "mensaje en una botella",
      "corazón caliente, cabeza fría",
      "gole de una mesa",
      "nunca nos subordinamos",
      "nada por la fuerza, todo por la razón"
    ]
  },
  "topics": [
    {
      "id": "politics",
      "examplePhrases": [
        "entrevista inusual a un medio extranjero",
        "mensaje en una botella",
        "regreso de Donald Trump a la Casa Blanca",
        "un país libre, independiente, soberano",
        "imposición de aranceles",
        "defensa del honor nacional"
      ]
    },
    {
      "id": "international-relations",
      "examplePhrases": [
        "relación con Estados Unidos",
        "no somos colonia",
        "colaborar con el adversario",
        "coordinamos, colaboramos, pero nunca nos subordinamos",
        "estrategia con cárteles",
        "alianza con cárteles"
      ]
    },
    {
      "id": "leadership",
      "examplePhrases": [
        "presidente que casi no daba entrevistas",
        "actitud tomada por Xóchitl Gálvez",
        "serenidad y paciencia",
        "defendió su postura firme",
        "gobierno de Sheinbaum",
        "mensaje presidencial del sábado por la noche"
      ]
    },
    {
      "id": "communication",
      "examplePhrases": [
        "entrevista original convocó a 800.000 espectadores",
        "edición de la entrevista por CBS",
        "respuesta molesta de López Obrador",
        "reacción en X de Sheinbaum",
        "palabras con las que Obrador terminó la carta",
        "mensaje que retumbó en el país"
      ]
    },
    {
      "id": "national-identity",
      "examplePhrases": [
        "defensa del honor nacional",
        "serenidad entre la defensa y colaboración",
        "citar el honor nacional",
        "no de subordinación",
        "soberanía en relaciones internacionales",
        "equilibrio donde ceder y defender"
      ]
    },
    {
      "id": "media",
      "examplePhrases": [
        "un descreído crónico de los medios",
        "manipulación de los medios",
        "visión crítica de la prensa",
        "reportaje del New York Times",
        "edición de la entrevista",
        "impacto de la entrevista en YouTube"
      ]
    }
  ]
}
```
</details>

## Washington Post / Opinions / Columns

`page-0/index.json`

```json
[
  {
    "authorName": "Eugene Robinson",
    "title": "The single most important battle Democrats must wage",
    "publishDate": "2025-02-03T23:00:51.362Z",
    "viewCount": -1,
    "url": "https://www.washingtonpost.com/opinions/2025/02/03/trump-congress-power/",
    "excerpts": [
      "Don’t let Donald Trump’s noise distract from his ultimate power grab.",
      "What are your thoughts on the Trump administration's recent actions, such as purging federal prosecutors and imposing tariffs on Canada, Mexico and China?"
    ],
    "id": "trump-congress-power_ZMJBAWJCO5FW5JGD7KMPEAGKBM"
  },
  {
    "authorName": "Max Boot",
    "title": "U.S. soft power took decades to build. Trump is dismantling it in weeks.",
    "publishDate": "2025-02-03T21:22:49.623Z",
    "viewCount": -1,
    "url": "https://www.washingtonpost.com/opinions/2025/02/03/donald-trump-tariffs-canada-mexico-soft-power/",
    "excerpts": [
      "With tariffs and an aid freeze, the president is eroding the United States’ standing in the world.",
      "How do you think the recent actions by President Trump, such as the trade war and foreign aid freeze, will impact America's global influence and relationships with other countries?"
    ],
    "id": "donald-trump-tariffs-canada-mexico-soft-power_3PCEKOQEVNFCZIXOBZTUCZUZAM"
  }
]
```

<details>
<summary>
<code>story-trump-congress-power_.../Eugene-Robinson_The-single-most-important-battle-Democrats-must-wage_excerpt.txt.profile.json</code> (analysis from excerpt of 3500 char)
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 16,
    "readingLevelName": "undergraduate",
    "reasons": [
      "Complex political context requiring background knowledge",
      "Use of specialized vocabulary relevant to governance and economics",
      "References to legal principles and historical context (e.g. Impoundment Control Act)",
      "Multilayered arguments evident in critique of political actions",
      "Presence of idiomatic expressions and metaphorical language",
      "Allusions to current events that require familiarity with media coverage",
      "The text’s emotional tone adds layers of interpretation",
      "Utilizes abstract reasoning about democracy and governance",
      "Discussions about economic implications of policy decisions",
      "Advanced sentence structures and varied punctuation points"
    ],
    "difficultWords": [
      "purged",
      "insurrection",
      "modus operandi",
      "decrees",
      "substantive",
      "smoke-and-mirrors",
      "usurp",
      "consequential",
      "disburses",
      "impound"
    ],
    "difficultPhrases": [
      "constant barrage of executive actions",
      "try to usurp the power of the purse",
      "a viper’s nest of radical-left marxists",
      "higher prices if he imposes his threatened tariffs",
      "who gets a check from the government"
    ]
  },
  "topics": [
    {
      "id": "political-power-grab",
      "examplePhrases": [
        "the power grab that would fundamentally change the nature of our democracy",
        "Trump’s attempt to usurp the power of the purse",
        "Trump has frozen money that Congress authorized",
        "acting over executive actions",
        "making maximalist demands",
        "funding lifesaving health services"
      ]
    },
    {
      "id": "government-purge",
      "examplePhrases": [
        "purge dozens of federal prosecutors",
        "shoved out the career Treasury Department official",
        "purged for nothing more than doing their jobs",
        "dedicated public servants",
        "brought in from his various companies",
        "fleeing Venezuela’s murderous regime"
      ]
    },
    {
      "id": "executive-actions",
      "examplePhrases": [
        "constant barrage of executive actions",
        "outrageous rhetoric coming from the White House",
        "executive actions to overwhelm",
        "shut it down",
        "confirmed it would slap tariffs",
        "decrees are substantive"
      ]
    },
    {
      "id": "tariffs-and-trade-war",
      "examplePhrases": [
        "slap tariffs on Canada, Mexico and China",
        "imposes his threatened tariffs",
        "dumbest trade war in history",
        "higher prices",
        "power to bestow or deny favors",
        "tariffs"
      ]
    },
    {
      "id": "government-accountability",
      "examplePhrases": [
        "elected by nobody and accountable to nobody",
        "Congress may defund USAID",
        "only a small number of people have access",
        "impound congressional spending",
        "imposing tariffs affects all of us",
        "removing references to gender identity"
      ]
    },
    {
      "id": "deportation-and-migration",
      "examplePhrases": [
        "sending refugees home",
        "deporting migrant families",
        "unfortunate fate",
        "daily quota",
        "fleeing murderous regimes",
        "migrant families rounded up"
      ]
    }
  ]
}
```
</details>

## 네이버 블로그 / 주제별 TOP

`page-1/index.json`

```json
[
  {
    "authorName": "피터정",
    "title": "현역가왕2 - 박서진 vs 강문경 / 신유 vs 진해성 - 정말 대박 무대였다!",
    "publishDate": "2025-02-04T18:08:20.631Z",
    "viewCount": 10,
    "url": "https://blog.naver.com/PostView.naver?redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false&blogId=restore2004&logNo=223748051577",
    "excerpts": [
      "트로트 전쟁, 1차 준결승전의 반전! – ‘현역가왕2’ 10회 예상치 못한 이변, 누가 웃고 누가 울었나 2024년 최고의 트로트 서바이벌, ‘현역가왕2’가 어느덧 준결승전까지 치러졌습니다. 매회 명곡이 탄생하는 무대 속에서, 이번 10회 준결승 1라운드는 말 그대로 충격과 반전의 연속이었습니다. 상위권에 머물던 참가자들이 흔들리고, 패자부활전에서 올라온 도전자가 예상 밖의 돌풍을 일으키는 등, 팬들의 예상을 완전히 뒤엎는 결과가 나왔습니다. ‘모정’ vs ‘망모’, 감동과 눈물의 대결 박서진 씨는 이미자의 ‘모정’을 선곡하며 감성적인 무대를 선보였습니다. 애절한 감성이 돋보이는 그의 목소리는 여전히 깊은 울림을 주었지만, 강력한 상대를 만났습니다. 강문경 씨가 나훈아의 ‘망모’를 불렀는데, 한 편의 드라마를 보는 듯한 무대 연출과 폭발적인 가창력이 결합되어 압도적인 몰입감을 선사했습니다. 결과는 예상 밖이었습니다. 강문경 씨가 296점을 기록하며 압도적인 승리를 거둔 반면, 박서진 씨는 104점으로 최저점을 받아 탈락 위기에 처했습니다. 트로트의 감성을 누구보다 깊게 전달하는 그였기에, 이 결과는 더욱 충격적이었습니다. \"현역가왕..."
    ],
    "id": "restore2004_223748051577"
  },
  {
    "authorName": "링고MJ맘",
    "title": "더 하모닉스-걱정 말아요 그대_하모니시스트와 클래식 색소포니스트의 프로젝트 듀오 앙상블의 첫 앨범 속 연주곡",
    "publishDate": "2025-02-05T02:10:30.878Z",
    "viewCount": 8,
    "url": "https://blog.naver.com/PostView.naver?redirect=Dlog&widgetTypeCall=true&noTrackingCode=true&directAccess=false&blogId=pingu96&logNo=223748341731",
    "excerpts": [
      "2025년 2월 4일 DJ존노의 추천곡은 더 하모닉스의 걱정 말아요 그대이다. 더 하모닉스는 박종성과 브랜든 최의 프로젝트 앙상블인데, 박종성과 브랜든 최에 대해 잠시 소개하면 다음과 같다. 박종성 1986년 10월 19일 출생 대한민국 최초의 하모니카 전공 졸업자. 2002년 아시아 태평양 하모니카 대회에서 청소년 트레몰로 부문 금상 수상. (한국인 하모니카 솔리스트 최초의 국제 대회 입상) 경희대학교 포스트모던음악학과 수석졸업. 2008년 아시아 태평양 하모니카 대회 (성인독주와 2중주, 앙상블 부문1위/ 3관왕) 2009년 세계 하모니카 대회 한국인 최초로 트레몰로 솔로 부문 1위, 재즈 크로매틱 부문 2위 대중적으로는 2019년 6월에 CBS 김현정의 뉴스쇼에 출연하면서 많이 알려졌다. 2023년 2월 호너의 글로벌 아티스트로 선정되었다. 클래스101에서 크로매틱 하모니카 온라인 강의도 하고 있다. [주요 내용 출처: 나무위키] 브랜든 최 본명 최진우 국내를 넘어 유럽과 미국을 비롯한 전 세계 무대에서 클래식 색소폰의 새로운 바람을 일으키고 있는 색소포니스트. 프랑스 리옹 국립 음악원에서 최고 연주자 과정을 졸업. 미국 신시내티 음대에서 전액 장학생으..."
    ],
    "id": "pingu96_223748341731"
  }
]
```

<details>
<summary>
<code>story-restore2004_223.../피터정_현역가왕2...정말-대박-무대였다!_excerpt.txt.profile.json</code> (analysis from full text excerpt)
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 12,
    "readingLevelName": "high school",
    "reasons": [
      "Use of advanced vocabulary and idiomatic expressions.",
      "Complex sentence structures that require comprehension skills.",
      "Inclusion of specific cultural references known primarily to those familiar with Korean pop culture.",
      "Thematic depth involving emotions and dramatic performances that may need critical thinking to fully appreciate.",
      "Presence of figurative language that complicates literal understanding.",
      "Names of songs and artists are overshadowed by contextual meanings that may not be universally recognized.",
      "Narrative style requires understanding of context and progression of events in the competition.",
      "Challenge in following the shifts in perspective between different characters and participants.",
      "Requires background knowledge of the genre (trot) and its cultural significance in Korea.",
      "The excerpt reflects analytical and evaluative responses indicating a higher level of critical reading. "
    ],
    "difficultWords": [
      "이변",
      "감성적인",
      "애절한",
      "충격적",
      "절절한",
      "명곡",
      "심사위원",
      "쿨함",
      "속내",
      "강렬한"
    ],
    "difficultPhrases": [
      "예상치 못한 이변",
      "한 편의 드라마를 보는 듯한 무대",
      "감동적인 무대를 선사"
    ]
  },
  "topics": [
    {
      "id": "trout-competition",
      "examplePhrases": [
        "트로트 서바이벌",
        "트로트의 감성을 전달하는",
        "가왕 결정 전의 대결",
        "치열한 경쟁 속에서",
        "트로트 황제의 탄생을 향해",
        "1차 준결승전의 반전"
      ]
    },
    {
      "id": "emotion-and-drama",
      "examplePhrases": [
        "애절한 감성이 돋보이는",
        "한 편의 드라마를 보는 듯한 무대",
        "감동적이고 애틋한",
        "모정의 깊은 감성",
        "관객들의 가슴을 저미게",
        "눈시울을 붉히기에 충분한 무대"
      ]
    },
    {
      "id": "unexpected-results",
      "examplePhrases": [
        "예상치 못한 이변",
        "예상 밖의 돌풍을 일으키는",
        "충격적인 최저점을 기록",
        "예상을 완전히 뒤엎는 결과",
        "상위권에 머물던 참가자들이 흔들리고",
        "방출 후보로 이름을 올리며 위기"
      ]
    },
    {
      "id": "musical-performance",
      "examplePhrases": [
        "감성적인 무대를 선보였습니다",
        "정통 트로트의 깊은 감성",
        "가창력과 감성으로 무대를 장악",
        "완성된 독보적인 무대",
        "강렬한 무대를 선보이며",
        "최고 점수를 기록하는 기염을 토했습니다"
      ]
    },
    {
      "id": "audience-reaction",
      "examplePhrases": [
        "관객들의 귀를 사로잡았고",
        "객석에서는 여기저기서 훌쩍이는 소리",
        "연예인 판정단과 방청객들도 놀란 기색",
        "그의 낮은 점수는 큰 충격으로",
        "팬들의 예상을 완전히 뒤엎는結果",
        "관객들과 심사위원들의 눈시울을 붉히기에"
      ]
    },
    {
      "id": "survival-show",
      "examplePhrases": [
        "계속되는 감동과 반전",
        "국가대표 서바이벌 프로그램",
        "결승 진출 가능성을 높였습니다",
        "매회 명곡이 탄생하는 무대",
        "마지막 결승 티켓은 누구에게 돌아갈까요?",
        "“현역가왕”이라는 영예를 거머쥐게 될까요?"
      ]
    }
  ]
}
```
</details>

## El Nuevo Día

`page-0/index.json`

```json
[
  {
    "authorName": "The Associated Press",
    "title": "Jueza del Supremo federal reitera su oposición a conceder amplia inmunidad a expresidentes",
    "publishDate": "2025-02-07T02:23:22.285Z",
    "viewCount": -1,
    "url": "https://www.elnuevodia.com/noticias/estados-unidos/notas/jueza-del-supremo-federal-reitera-su-oposicion-a-conceder-amplia-inmunidad-a-expresidentes/",
    "excerpts": [
      "Sonia Sotomayor dijo que el tribunal ha ido demasiado lejos y demasiado rápido en una serie de cuestiones "
    ],
    "id": "the-associated-press_3RFJBKIYHNE5ZOCLW2UENMQXME"
  },
  {
    "authorName": "The Associated Press",
    "title": "El plan de Donald Trump para Gaza genera críticas, pero encuentra apoyo en Israel",
    "publishDate": "2025-02-07T01:55:48.931Z",
    "viewCount": -1,
    "url": "https://www.elnuevodia.com/noticias/mundo/notas/el-plan-de-donald-trump-para-gaza-genera-criticas-pero-encuentra-apoyo-en-israel/",
    "excerpts": [
      "La idea de expulsar a cientos de miles de palestinos ha encontrado suelo fértil"
    ],
    "id": "the-associated-press_YDJ6BOPMPJHMFNKGFLYOBFDLDI"
  }
]
```

<details>
<summary>
<code>story-the-associated-press_3RFJB.../...-amplia-inmunidad-a-expresidentes_excerpt.txt.profile.json</code> (analysis from full text excerpt)
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 14,
    "readingLevelName": "undergraduate",
    "reasons": [
      "Use of legal terminology and concepts involves higher comprehension skills",
      "Complex sentence structures requiring advanced reading skills",
      "Discussion of abstract concepts like legitimacy and constitutional rights",
      "References to historical cases (Roe vs. Wade) which may not be common knowledge",
      "Analysis of public perception and its implications on the judiciary requires critical thinking",
      "Demonstrates an understanding of constitutional law and legal precedents",
      "The vocabulary includes sophisticated and specialized language",
      "Issues of political ideology and the implications of judicial decisions",
      "Engagement in nuanced argumentation and dissent",
      "Contextual understanding of the political climate and its impact on law"
    ],
    "difficultWords": [
      "inmunidad",
      "disentimiento",
      "legitimidad",
      "constitucional",
      "precedentes",
      "disturbios",
      "jurídico",
      "análisis",
      "partidistas",
      "democracia",
      "deshacer",
      "proceso",
      "observaciones",
      "jurisprudencia",
      "promoción"
    ],
    "difficultPhrases": [
      "reiterar su oposición",
      "ser cuestionada",
      "rey por encima de la ley",
      "disminución de la confianza pública",
      "inestabilidad en la sociedad",
      "sentencias que rompen con el precedente",
      "visiones partidistas",
      "en dirección que serán difíciles de entender",
      "fomentar mejor nuestra democracia"
    ]
  },
  "topics": [
    {
      "id": "judicial-independence",
      "examplePhrases": [
        "juicios políticos",
        "la legitimidad será cuestionada",
        "inmunidad a expresidentes",
        "los estadounidenses hayan aceptado que alguien deba estar por encima de la ley",
        "las percepciones públicas del tribunal",
        "anular precedentes con décadas de antigüedad"
      ]
    },
    {
      "id": "public-trust-in-government",
      "examplePhrases": [
        "disminución de la confianza pública",
        "percepción de la gente sobre la ley",
        "insatisfacción social",
        "ruido sobre la legitimidad del tribunal",
        "inseguridad con los cambios",
        "confianza en la democracia"
      ]
    },
    {
      "id": "political-views-in-law",
      "examplePhrases": [
        "visiones partidistas",
        "análisis legal",
        "creencias sobre la Constitución",
        "cambio de rumbo del tribunal",
        "justicia económica y social",
        "enfoques democráticos"
      ]
    },
    {
      "id": "supreme-court-decisions",
      "examplePhrases": [
        "fallo que limitaba el alcance de los cargos penales",
        "anulación del fallo en el caso Roe vs. Wade",
        "sentencias que rompen con el precedente",
        "cambios profundos en los últimos años",
        "decisiones históricas del tribunal",
        "cerrar la puerta a la igualdad"
      ]
    },
    {
      "id": "promoting-social-justice",
      "examplePhrases": [
        "dedicación a la justicia económica",
        "Medalla Brandeis",
        "trabajo en la promoción del servicio público",
        "equidad en la sociedad",
        "justicia social",
        "abogacía legal"
      ]
    },
    {
      "id": "public-perception-of-law",
      "examplePhrases": [
        "percepción de inestabilidad",
        "cambios rápidos en la ley",
        "comunicación de la corte con el público",
        "análisis de percepciones",
        "legitimidad de la ley",
        "sentimiento público sobre decisiones judiciales"
      ]
    }
  ]
}
```
</details>

## Project Gutenberg

`page-1/index.json`

```json
[
  {
    "authorName": "Beck, Charles",
    "title": "$1,000 a Plate",
    "publishDate": null,
    "viewCount": -1,
    "url": "https://www.gutenberg.org/ebooks/50921.txt.utf-8",
    "excerpts": [],
    "id": "50921"
  },
  {
    "authorName": "Blot, Pierre",
    "title": "The $100 Prize Essay on the Cultivation of the Potato.\r\nPrize offered by W. T. Wylie and awarded to D. H. Compton.\r\nHow to Cook the Potato, Furnished by Prof. Blot.",
    "publishDate": null,
    "viewCount": -1,
    "url": "https://www.gutenberg.org/ebooks/25905.txt.utf-8",
    "excerpts": [],
    "id": "25905"
  },
  {
    "authorName": "Twain, Mark",
    "title": "The $30,000 Bequest, and Other Stories",
    "publishDate": null,
    "viewCount": -1,
    "url": "https://www.gutenberg.org/ebooks/142.txt.utf-8",
    "excerpts": [],
    "id": "142"
  }
]
```

<details>
<summary>
<code>story-142/...$30,000-Bequest,-and-Other-Stories_excerpt.txt.profile.json</code>
</summary>

```json
{
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "sexual",
      "hate",
      "harassment",
      "self-harm",
      "sexual/minors",
      "hate/threatening",
      "violence/graphic",
      "self-harm/intent",
      "self-harm/instructions",
      "harassment/threatening",
      "violence",
      "profanity"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 12,
    "readingLevelName": "high school",
    "reasons": [
      "The use of intricate sentence structures is prevalent throughout the text.",
      "Inclusion of historical and cultural references that require broader knowledge.",
      "Characters' names and complex relationships are revealed without extensive explanation.",
      "Vocabulary includes specialized terms from economics and gardening which may not be common for all readers.",
      "Dialogue contains idiomatic expressions and regional dialects which may confuse non-native speakers.",
      "The narrative style is rich with descriptive language that may challenge comprehension.",
      "References to societal norms and religious practices may require contextual understanding.",
      "Themes of aspiration and class dynamics are presented, adding layers of complexity to the narrative.",
      "Allusions to larger societal issues may require critical thinking to fully grasp the implications.",
      "Cultural and lifestyle differences depicted may present challenges for contemporary readers. "
    ],
    "difficultWords": [
      "accommodations",
      "inhabitants",
      "Prospect",
      "sect",
      "plant",
      "capable",
      "helpmeet",
      "dabbler",
      "vegetable",
      "shares",
      "banked",
      "expenses",
      "thenceforth",
      "furnished",
      "comfortable",
      "aspiration",
      "concede",
      "remainder",
      "decadent",
      "salaried"
    ],
    "difficultPhrases": [
      "church accommodations for thirty-five thousand",
      "dreamer of dreams",
      "farmed on shares",
      "a handsome figure indeed",
      "built and furnished a pretty house",
      "banked two hundred a year",
      "marriage-week",
      "climbed steadily up",
      "sociable friendliness",
      "prevailing atmosphere"
    ]
  },
  "topics": [
    {
      "id": "community",
      "examplePhrases": [
        "a pleasant little town",
        "everybody knew everybody",
        "sociable friendliness",
        "church accommodations for thirty-five thousand",
        "the Far West and the South",
        "represented Protestant sects"
      ]
    },
    {
      "id": "dreams-and-aspirations",
      "examplePhrases": [
        "a private dabbler in romance",
        "dreamer of dreams",
        "buy an acre of ground",
        "made it pay her a hundred percent",
        "banked two hundred a year",
        "capable helpmeet"
      ]
    },
    {
      "id": "financial-struggles",
      "examplePhrases": [
        "high-salaried man",
        "climbed steadily up",
        "wage had remained eight hundred",
        "when she had been married seven years",
        "forty dollars a year",
        "her fortune"
      ]
    },
    {
      "id": "family-and-relationships",
      "examplePhrases": [
        "wife, Electra",
        "two children had arrived",
        "move her family in",
        "married child",
        "helpmeet",
        "growing expenses"
      ]
    },
    {
      "id": "hard-work-and-perseverance",
      "examplePhrases": [
        "farmed on shares",
        "instituted a vegetable garden",
        "put thirty dollars in the savings-bank",
        "out of his second",
        "out of his third"
      ]
    },
    {
      "id": "gender-roles",
      "examplePhrases": [
        "only high-salaried man",
        "capable helpmeet",
        "private dabbler in romance",
        "child as she was",
        "her marriage",
        "the danger of lying in bed"
      ]
    }
  ]
}
```
</details>

# Installation

This is not currently published as a package, so you can `git clone` or download the repo source.

```shell
# clone source locally
git clone github.com/.../doc-level
# enter doc-level root
cd doc-level
# install doc-level dependencies
npm install
```

## Load OpenAI API credentials

Profiles are created by prompting [OpenAI language model APIs](https://platform.openai.com/docs/overview). Create a project in their web dashboard with an allotted budget (you can set spending limit), and download an API key. To give an idea of cost, while developing this app for about a month, I've spent under 0.05 USD so far.

Create a `.env` file in the `doc-level` root directory with `OPENAI_API_KEY="<your-api-key>"`.

# Usage

After installing, inside the `doc-level` root directory, run the entrypoint script with `node`.

```shell
cd doc-level
# run with package script. Using `npm run <program>` requires ending with `--` before providing options for the target program.
npm run cli -- -h
# or directly
node src/index.js -h
```

The output locations will by default be relative to your current working directory, under `data/`.

Logs are written to `logs/doc-level_cli.log`.

## Fetch list of stories

Pick a stories index (ex. `문장웹진 = https://munjang.or.kr/`, `washpost = https://www.washingtonpost.com/`) from which to fetch the list of story metadata. Let's say it's `internet`.

```shell
npm run cli -- -f internet
```

```txt
...
Story lists:
[internet]
  [0] data/stories/internet/page-0/index.json
```

Open this page index in an editor to see the fetched stories.

```json
[
  {
    "authorName": "Aaron Abalone",
    "title": "Arab apples",
    "publishDate": "2025-02-03T23:00:51.362Z",
    "viewCount": -1,
    "url": "https://internet.com/path/to/aa_111",
    "excerpts": [
      "Sentence one.",
      "Sentence two."
    ],
    "id": "aa_111"
  },

  {"...": "..."}
]
```

## Generate profiles of fetched stories

Let's generate a profile of the first story in `internet/page-0/index.json`.

```shell
[opts]: -i internet -p 0 -s aa_111
# or, below equivalent
[opts]: -i internet -p @first -s @first
```

```txt
aa_111 profile at data/profiles/internet/aa_111/Aaron-Abalone_Arab-apples_excerpt.txt.profile.json
```

Open this profile in an editor.

```json
{
  "filePath": "data/profiles/internet/aa_111/Aaron-Abalone_Arab-apples_excerpt.txt.profile.json",
  "maturity": {
    "isRestricted": false,
    "presents": [],
    "absents": [
      "etc"
    ],
    "examples": []
  },
  "difficulty": {
    "yearsOfEducation": 12,
    "readingLevelName": "high school",
    "reasons": [],
    "difficultWords": [],
    "difficultPhrases": []
  },
  "topics": [
    {
      "id": "fruit",
      "examplePhrases": [
        "if an apple or cherry were in question",
        "etc"
      ]
    }
  ],
  "ideologies": [
    {"...": "..."}
  ]
}
```

## Autopilot

Once we're comfortable with results from profiling stories one at a time, we can use `--autopilot` to queue a list of stories to be profiled without user intervention.

The `-m` limiter both when defining the start story with `-s`, and when passing in results from search history with `-H`.

```shell
# in internet, starting from first story on page 2, fetch and profile 20 stories using autopilot
[opts]: -i internet -p 2 -s @first -m 20 -a
```

```txt
launch autopilot
...
fetched pages of 20 story summaries
queued 20 story processors
select index=internet page=2 story=1629
select index=internet page=2 story=1630
select index=internet page=2 story=1631
select index=internet page=2 story=1632
select index=internet page=2 story=1633
select index=internet page=2 story=1634
select index=internet page=2 story=1635
select index=internet page=2 story=1636
select index=internet page=2 story=1637
select index=internet page=2 story=1638
select index=internet page=2 story=1639
select index=internet page=2 story=1640
select index=internet page=3 story=1641
select index=internet page=3 story=1642
select index=internet page=3 story=1643
select index=internet page=3 story=1644
select index=internet page=3 story=1645
select index=internet page=3 story=1646
select index=internet page=3 story=1647
select index=internet page=3 story=1648
story-1629 profile at data/profiles/internet/story-1629/권여선_문상_excerpt.txt.profile.json
...
story-1643 profile at data/profiles/internet/story-1643/이재웅_고모의-사진_excerpt.txt.profile.json
end autopilot
```

## Browse library

Once we've generated several story profiles, we want to quickly navigate them. Let's check available tags by which we can search.

### View tags

```shell
[opts]: --show-library tag
```

Generates `data/renders/library_tags.txt`. Viewing this file we can see tags under `author-name`, `publish-date`, `title`, `years-of-education`, `topic`, etc.

```txt
... / library-book / story / author-name / aaron abalone
... / library-book / story / author-name / ács, géza
... / library-book / story / author-name / ambrus, zoltán
...
... / library-book / story / publish-date / 1970-01-01
... / library-book / story / publish-date / 2006-10-31
...
... / library-book / story / title / vulkane monde
... / library-book / story / title / wonderful lucerne cream appetizers desserts recipes kitchen american dairy association
... / library-book / story / title / worked hegseth probably gabbard kennedy
...
... / library-book / text-profile / difficulty / difficult-word
... / library-book / text-profile / difficulty / reading-level
... / library-book / text-profile / difficulty / years-of-education
... / library-book / text-profile / ideology / globalist
...
... / library-book / text-profile / topic / addiction
... / library-book / text-profile / topic / emotion-and-drama
... / library-book / text-profile / topic / family-and-relationships
... / library-book / text-profile / topic / financial-struggles
...
... / stories-index / index-page / page-dir / data/stories/el-país/page-0
... / stories-index / index-page / page-dir / data/stories/gutenberg/page-1
... / stories-index / index-page / page-dir / data/stories/nuevo-dia/page-0
... / stories-index / index-page / page-dir / data/stories/washington-post/page-0
```

### Search by tag

Searches are performed by adding conditions to the `-L <format>` option.

#### Single condition

View the stories with lowest reading level.

```shell
[opts]: -L txt -t years-of-education -> asc
```

#### Composite condition

Tag values are singular and unique strings. Determining whether tag `globalist` should refer to a `difficult-word` or an `ideology` depends on from which parent/ancestor tag you are searching. That is the primary function of a search condition being a composite of `-t` (the ancestor tag) and `-q` (the tag pattern applied to its descendants).

Examples below.

View stories whose author name contains `"rob"`.

```shell
[opts]: -L txt -t author-name -q /.+rob.+/
```

View stories that cover topics that start with `"politic"`.

```shell
[opts]: -L txt -t topic -q /politic.+/
```

View latest stories published in the year 2007.

```shell
[opts]: -L txt -t publish-date -q /2007-.+/ -> desc
```

#### Search expression

Instead of the more limited `-t` and `-q` opts, `-?` defines an expression that combines any number of the conditions that `-t` and `-q` provide.

When the search expression contains logical operators (set operations), sort is currently applied as follows.

- On intersect `&&`, sort is applied to the first set.
- On union `||`, sort is applied to each set individually before they are combined.

##### Search expr syntax

| token | description |
| --- | --- |
| `t` | Tag name variable, for exact match. |
| `q` | Tag name pattern/query variable, for regexp match. |
| `==` | Separator between `t/q` and the literal value to match; positive condition operator. |
| `!=` | Separator between `t/q` and the literal value to **not** match; negative condition operator. |
| `^` | Separator within a composite condition between the `t` and `q` conditions. |
| `&&` | Logical operator AND. Behaves like set intersection. |
| <code>&#124;&#124;</code> | Logical operator OR. Behaves like set union. |
| `-` | Logical operator NOT. Behaves like set complement (unary operator) or difference (binary operator). |
| `()` | Grouping operator. Optionally surround any expression with parentheses. |

##### Search expr examples

View stories with profile having `difficulty.years-of-education` that belong to stories index `문장웹진`.

```shell
[opts]: -? "(t == 'difficulty' ^ q == 'years-of-education') && (t == 'index-name' ^ q == '문장웹진')" -L txt
```

View stories either by author `harriet hepping` or having `harriet` in the title.

```shell
[opts]: -? "t == 'author-name' ^ q == 'harriet hepping' || t == 'title' ^ q == '/.*harriet.*/'" -L txt
```

View stories published in year `2000` without tag `baily buchemi` using set difference.

```shell
[opts]: -? "(t == 'publish-date' ^ q == '/2000-.+/') - (t == 'bailey buchemi')"
```

Same result, using set intersection with complement.

```shell
[opts]: -? "(t == 'publish-date' ^ q == '/2000-.+/') && -(t == 'bailey buchemi')"
```

Same result, using set intersection with negative condition.

```shell
[opts]: -? "(t == 'publish-date' ^ q == '/2000-.+/') && (t != 'bailey buchemi')"
```

### How library items are tagged

When a story is added to the library, it is assigned to a `LibraryBook` instance. A book combines all the information we now about the story (ex. author, title, source url, stories index, index page, text profile). In object hierarchy, `story` is a child/member of `book`, and `profile` is another member of `book`.

Tags also have a hierarchy, which mostly parallels the object hierarchy. There is a tag `story` that is child of tag `library-book`, and `text-profile` child of `library-book`. As mentioned under [view tags](#view-tags), you can use `-L tag` to view the full hierarchy.

At implementation level, tags are almost never connected directly to books. Instead, they are connected to the book's `story`, or its `profile.maturity`. For example, tag `story.author-name.aaron abalone` will connect to object `book.story`, and tag `text-profile.topic.emotion-and-drama` will connect to object `book.profile.topics`. However, from a user perspective this generally doesn't matter, because these book members (of class `LibraryDescriptor`, called **descriptors**) still each belong to a single book, which is what the search will return.

#### `library-book.text-profile.maturity`

Unlike the other child tags of `text-profile`, `maturity` will only be (transitively) connected to a `book.story` descriptor if one of the supported maturity types (ex. `maturity.harassment`, `maturity.profanity`) is present in the profiled story text. Likewise, `maturity.restricted` is assigned if any of the maturity types are present. So `maturity` and `maturity.restricted` are basically redundant.

## Search history

Every library search will create an entry in search history. These can be viewed time descending with `-H <n>`, where `<n>` is optionally how many entries to show. History entry files are assigned a monotonically increasing integer. You can delete unwanted history entry files and will see the missing entry numbers reflected in the output of `-H`.

```txt
[opts]: -H 3

Library search history: show latest 3 until Infinity
[32] @2025-02-22T18:56:04.860Z x22
        ((-? "((t == 'years-of-education') && t == '문장웹진' && (t == 'reading-level' ^ q == 'high school')) - (t == 'maturity' ^ q == 'restricted')" -> asc -L txt))
        [data/renders/library_search-expr=t-years-of-education-&&-t-문장웹진-&&-t-reading-level-^-q-high-school---t-maturity-^-q-restricted.txt]
[31] @2025-02-22T18:53:21.138Z x66
        ((-? "((t == 'years-of-education') && t == '문장웹진') - (t == 'maturity' ^ q == 'restricted')" -> asc -L txt))
        [data/renders/library_search-expr=t-years-of-education-&&-t-문장웹진---t-maturity-^-q-restricted.txt]
[29] @2025-02-22T18:45:34.398Z x21
        ((-? "(t == 'years-of-education') && (t == 'maturity' ^ q == 'restricted')" -> asc -L txt))
        [data/renders/library_search-expr=t-years-of-education-&&-t-maturity-^-q-restricted.txt]
```

Each entry includes the result count, input options, and rendered result file path.

### Library search as input to autopilot

Instead of specifying a start story and count, you can pass the result of a library search to `--autopilot` by combining with `-H <n>`, where `<n>` is the **search entry number** instead of a count.

From the above example, `-a -H 29` would pass in **21** stories from search number 29 for autopilot to process.

## Custom tagging

User defined custom tags and connections are provided through the `-T/--custom-tag` option. The value is a semicolon delimited list of tag operation statements. Below are supported tag operations. Tag aliases and weighted connections are not currently supported.

| tag operation | syntax | description |
| --- | --- | --- |
| create tag | `+t['tag-name']` | Creates a new tag if not exists. User defined custom tags are automatically connected as children of `custom-tag`. |
| delete tag | `-t['tag-name']` | Deletes a tag if exists, and if child of `custom-tag`. `doc-level` generated tags can technically be deleted during a session, but will be restored the next time that the library loads from local filesystem. |
| connect parent to child tag | `t['parent'] += t['child']` | Defining a connection with a tag that does not exist will fail; tags must be defined before they are connected. |
| disconnect tags | `t['tag-1'] -= t['tag-2']` | If as a result a tag has no connections, the tag is **not deleted** automatically. |
| connect tag to story | `t['tag-name'] += s['index-name']['story-id']` | `index-name` is required because story ids as derived from each stories index are only guaranteed unique within that index. |
| disconnect tag to story | `t['tag-name] -= s['index-name']['story-id']` | |

For example, let's define a tag `read-date` for whether I've read a story, and when. Then, we'll connect it to a story to say that I read it on 1 January 2001.

```shell
[opts]: -T "+t['read-date']; +t['2001-01-01']; t['read-date'] += t['2001-01-01']; t['2001-01-01'] += s['index-1']['jungle-book_1234']"
```

Above statements could have been broken into 4 separate inputs.

```shell
[opts]: -T "+t['read-date']" 
[opts]: -T "+t['2001-01-01']" 
[opts]: -T "t['read-date'] += t['2001-01-01']" 
[opts]: -T "t['2001-01-01'] += s['index-1']['jungle-book_1234']"
```

## Terms

| term | description |
| --- | --- |
| **stories index** | A source (usually website) from which stories are added to the local library. |
| **index page** | Given the stories index is paginated, a single page will contain a subset of available stories from the index. |
| **story** | A source text with metadata like `title` and `author`. |
| **library** | All queryable information generated by `doc-level`, like stories and profiles. |
| **excerpt** | A reduced subset of the content of a story's full source text that is used as input for generating a profile. |
| **Profile** | Analysis/metrics/description of a story. |
| **Tag** | A search/query term that can be used to find stories in the library. |

## CLI options

Use the `--help/-h` option to view information about available options. The app is written to cycle and wait for a new set of options indefinitely until quitting (ex. with `ctrl + c`).

If none of `-F`, `-s`, or `-L` are provided, then the previously fetched story index pages/lists are printed to the console for reference. 

| option keys | description | requires |
| --- | --- | --- |
| `-f, --fetch-stories-index` | Fetch stories from a registered index/listing website. | |
| `-F, --local-story-file` | Load an isolated story from a local full text file path. Use this if you already have a local text file to analyze. During load, `doc-level` will prompt for basic metadata in order to tag the story in the library. These stories will be assigned to a special stories index called `local`. | |
| `-m, --fetch-stories-max` | Max number of stories to fetch. | `-f` |
| `-s, --story` | Identifier of a story to be loaded and profiled. If combined with `-f` or `-a`, defines the story from which to begin. | |
| `-i, --index` | Stories index/listing name. | `-s` |
| `-p, --page` | Page number within stories index. If combined with `-f`, provides page from which to start fetch. | `-s` or `-f` |
| `-n, --story-length-max` | Max character length of story text to include when generating its profile. | `-s` |
| `-P, --force-profile` | Even if a profile for the selected story exists, generate a new one to replace it. | `-s` |
| `-0, --skip-profile` | Even if a story is selected, do not generate a profile for it. | `-s` |
| `-a, --autopilot` | Continue to cycle through stories and pages without pausing for input until `-m` is reached. Combine with `-i`, `-p`, `-s` opts to specify from which story to begin. | `-s` or `-H` |
| `-L, --show-library` | Show library (fetched stories, profiles, indexes, etc). Combine with other opts to only show a subset of items.<ul><li>`tag` = Print flat list of all available tags for searching. This is a good way to get an idea of how the stories are organized. Filters like `-t` and `-q` are not applicable here.</li><li>`txt` = Print flat list of books to a plain text file. </li><li>`md` = Render as a markdown file.</li><li>`html` [pending] = Render as a local webpage.</li></ul> | |
| `-t, --tag` | Tag name for searching library items. If combined with `-q`, defines the parent tag under which search is performed. | `-L` |
| `-q, --query` | Tag name pattern as a query string for searching library items. Surround with slashes like `/\w+e/` to search using a regular expression. Note that currently the regexp must match the whole tag name, not a substring. | `-L` |
| `-?, --search-expr` | Library search expression with support for logical operators. Syntax is described in more detail below. Replaces `-t` and `-q` for more advanced searches. | `-L` |
| `->, --sort` | Sort direction of search results. Ex. `-t years-of-education -> asc` will sort easiest texts first, and `-> desc` hardest first. | `-L` |
| `-H, --show-history` | Load and show `<n>` (value optional) latest entries from library search history. Combine with `--autopilot` to profile the results from entry number `<n>`, higher is newer. |
| `-T, --custom-tag` | Create custom tags and connections. Syntax is a list of semicolon delimited statements, each being a tag operation. See [Usage > Custom tagging](#custom-tagging) for supported operations. | |
| `-d, --stories-dir` | Local filesystem directory where story lists and texts are saved. | |
| `-D, --profiles-dir` | Local directory where story profiles are saved. | |
| `-e, --renders-dir` | Local directory where library renderings/exports are saved. | |
| `-r, --reload` | Whether to reload library objects from the filesystem. Not usually necessary unless files were changed manually. | `-L` |
| `-v, --version` | Show app version. | |

For `--story`, instead of providing a story id, you can also use variable expressions `@first` for the first story in the page, `@next` for the next story in the page, or `@<array-index>` for the story at a given index within the page stories array. `@first` and `@0` are equivalent.

Similarly for `--page`, instead of providing a page number, you can also use variable expressions `@first` for the first page in the stories index, or `@next` for the next page. If used with `-f`, then `@next` is **the next page after the last** one already in the local filesystem, instead of the next after the most recently used page.

For `--show-history`, the opt value can be a number or, if used as input to `--autopilot`, variable
`@last` to refer to newest search entry.

`-L` is used to explore the library.
Combine with `-t` (tag name), `-q`, (tag name pattern), or both (composite of ancestor tag and descendant tag pattern) to define the filter condition. 
Or, combine with `-?` (search expression) for more complex searches. See [Browse library > Search by tag > Search expression](#search-expression) for details.

# Development

All errors and feature requests can be submitted as issues on github.

The most likely candidates for development would be:

1. New subclasses of `StoriesIndex`. This abstract class supports adding new sources of reading materials (ex. short stories, news/journal/magazine/blog articles, screenplays).
1. New attributes of `TextProfile` and corresponding language model prompt templates at `src/resource/prompt/`.

# References

[OpenAI API docs](https://platform.openai.com/docs/overview)
