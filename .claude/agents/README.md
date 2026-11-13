# Custom Subagents — TravelPlan

## Agent hiện có

| Agent (`name`) | File | Model | Tools | Dùng khi |
|---|---|---|---|---|
| `code-reviewer` | `code-reviewer.md` | sonnet | Read, Grep, Glob, Bash | Review diff trước khi commit/mở PR — TDD compliance, kích thước/trách nhiệm file, layer violation, commit convention, security, Python, an toàn dữ liệu. |
| `researcher` | `researcher.md` | sonnet | Read, Grep, Glob | Khám phá codebase (planner, itinerary builder, destinations RAG, calendar sync...) trước khi lập kế hoạch hoặc sửa code. |
| `qa-testing` | `qa-testing.md` | sonnet | Read, Grep, Glob, Bash, Edit, Write | Viết/chạy test theo TDD Red-Green-Refactor, backend (Vitest) và frontend (Vitest/RTL, MSW, Playwright). |

## Convention

Mỗi subagent là 1 file `.md` trong thư mục này. **Định danh thật của agent là field `name` trong frontmatter, không phải tên file** — tên file chỉ để dễ tìm, có thể khác `name`.

Frontmatter tối thiểu:

```markdown
---
name: agent-slug              # bắt buộc — định danh dùng khi gọi qua Agent tool
description: Mô tả ngắn gọn agent này làm gì và khi nào nên dùng nó.
tools: Read, Grep, Glob        # tuỳ chọn — chuỗi phân tách dấu phẩy, KHÔNG phải YAML list. Bỏ trống = kế thừa toàn bộ tool.
model: sonnet                  # tuỳ chọn — alias hợp lệ: sonnet, opus, haiku, fable (hoặc full model ID)
---

Nội dung system prompt của agent, viết như hướng dẫn cho một đồng nghiệp mới nhận việc.
```
