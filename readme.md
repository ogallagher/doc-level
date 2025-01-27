# doc-level • 독해수준

Analyze texts to estimate reading level. 

글을 해석해서 독해수준을 짐작하기.

Existing apps or browser extensions could probably do this, or perhaps an AI language model could be thus prompted, to give an analysis of a text/article/etc along customizable parameters.

## Example parameters/metrics[측정, 치수]:

- Reading difficulty[독해수준], mainly according to vocabulary.
- Novelty of vocabulary (archaic vs neologistic language).
- Offensiveness, irreverence, reader recommended maturity level.
- Political bias.
- Genres/categories: drama, exposition, opinion, research, science, entertainment, comedy, tragedy, religion, history.

In my case, as a browser extension, I’m most interested in quickly measuring reading difficulty of written webpage content for language learning. The ratings would be calculated for the current webpage (link depth 0), then possibly for linked pages (link depth 1), and less usefully for more distant linked pages also (depth > 1).

## OpenAI API results

### `moderations`

This looks for offensive markers in text and images, from the categories listed below. It does not appear to flag curse words. It does work for multilingual input, as do all other endpoints that take text input.

```txt
"sexual","hate","harassment","self-harm","sexual/minors","hate/threatening",
"violence/graphic","self-harm/intent","self-harm/instructions",
"harassment/threatening","violence"
```

### `chat.completions`

General purpose natural language prompts. Input can be a combination of:

1. `role=developer` Contextual directions that take precendence over user directives.
1. `role=assistant` Past responses by the language model/assistant.
2. `role=user` Past and present prompts/queries by the user.

For app integration, passing a JSON object schema to `response_format` ensures the response can be easily parsed.

## References

[OpenAI API docs](https://platform.openai.com/docs/overview)