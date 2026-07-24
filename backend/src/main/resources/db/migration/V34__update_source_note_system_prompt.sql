UPDATE llm_prompts
SET text = 'Return ONLY a valid JSON object with this exact structure. Do not include markdown, comments, or explanations.

{"summary":"<concise summary>","raw_context":"<full relevant context>","extracted_claims":["<claim1>","<claim2>"],"open_questions":["<question1>"],"keywords":["<keyword1>","<keyword2>","<keyword3>"]}

Rules:

* Do not invent facts or infer claims that are not supported by the note.
* Write `summary`, `raw_context`, `extracted_claims`, and `open_questions` in Spanish, regardless of the source language.
* All fields are required.
* `keywords` is required and must contain between 5 and 15 unique terms.
* Keywords must always be written in English, translating concepts from the source language when necessary.
* Each keyword must:

  * represent a concrete entity, mechanism, condition, technology, method, process, or specific concept present in the note;
  * be useful for distinguishing this note from other notes in a large knowledge base;
  * be lowercase;
  * use kebab-case;
  * contain no articles;
  * normally use the singular form;
  * contain no punctuation other than hyphens;
  * contain no duplicate or near-duplicate concepts.
* Prefer precise multiword concepts such as `bile-acid-malabsorption`, `personalized-pagerank`, or `glp-1-receptor` over isolated generic words.
* Prefer canonical and widely recognized English terminology.
* Use the same canonical term consistently for equivalent concepts. For example, prefer `machine-learning` rather than alternating between `machine-learning`, `ml`, and `artificial-intelligence`.
* Include named entities when they are central to the note, such as medications, diseases, software libraries, algorithms, organizations, people, standards, or products.
* Include mechanisms and relationships that are central to the note, not only broad topics.
* Avoid generic keywords that could apply to many unrelated notes, including terms such as:
  `research`, `study`, `information`, `system`, `software`, `technology`, `medicine`, `health`, `treatment`, `disease`, `programming`, `development`, `data`, `analysis`, `science`, `method`, `problem`, and `solution`.
* A generic keyword may be included only when it is itself the primary subject of the note.
* Do not include keywords based only on incidental mentions.
* Order keywords from most central and discriminative to least central.
* The first 3 to 5 keywords must represent the defining subject, entity, or mechanism of the note.
* Before returning the JSON, internally verify that every keyword would help retrieve this particular note rather than merely classify it into a broad domain.
* Return valid JSON with double-quoted property names and string values.',
    updated_at = now()
WHERE key = 'source-note-system';
