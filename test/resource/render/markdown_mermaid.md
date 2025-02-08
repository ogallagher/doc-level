# Render `doc-level` library in [mermaid](https://mermaid.js.org/intro/) format

## `flowchart`

```mermaid
flowchart LR

%% comment

subgraph g1["subgraph one"]
    direction TB
    
    A1["square"] -->|"edge **label**"| B1("round")
    B1 --> C1{"decision"}:::style1
    C1 -->|"one"| D2["result 1"]
    C1 -->|"two"| E2["result 2"]
end
subgraph g2["subgraph two"]
    direction TB

    A2["square"] -->|"edge label"| B2("round")
    B2 --> C2{"decision"}:::style2
    C2 -->|"one"| D["result 1"]
    C2 -->|"two"| E["result 2"]
end

g1 --> g2

classDef style1 fill:#f9f, stroke:#333, stroke-width:4px
classDef style2 fill:#9ff, stroke:#333, stroke-width:4px
```

## Options to view rendered mermaid

### IDE plugins

| img | url |
| --- | --- |
![bierner.markdown-mermaid](https://bierner.gallerycdn.vsassets.io/extensions/bierner/markdown-mermaid/1.27.0/1731976164380/Microsoft.VisualStudio.Services.Icons.Default) | [bierner.markdown-mermaid](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)

### Convert mermaid to SVG images

| img | url | description |
| --- | --- | --- |
| ![mermaid](https://mermaid.js.org/mermaid-logo.svg) | [mermaid-cli](https://www.npmjs.com/package/@mermaid-js/mermaid-cli) | Install as a cli program, ex.<br/> `npm install -g @mermaid-js/mermaid-cli`.<br/> Convert `mermaid` source code blocks to svg file references,<br/> `mmdc -i markdown_mermaid.md -o markdown_mermaid-svg.md -t dark -b transparent`.<br/>This is demonstrated with `npm run test-render-markdown`. |