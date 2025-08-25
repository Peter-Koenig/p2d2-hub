# Leitfaden für Code-Reviews

Dieser Leitfaden beschreibt Standards und Best Practices für Code-Reviews im p2d2-Projekt. Er soll helfen, Qualität zu sichern, Wissen zu teilen und konsistente Prozesse zu etablieren.

## Zweck von Code-Reviews

- Codequalität verbessern
- Wissen im Team teilen
- Fehler frühzeitig erkennen
- Konsistenz sicherstellen
- Junior-Entwickler:innen begleiten

## Review-Mindset

### Als Reviewer:in
- Konstruktiv und respektvoll sein
- Fokus auf den Code, nicht auf Personen
- Das „Warum“ hinter Vorschlägen erläutern
- Akzeptieren, dass es mehrere valide Lösungen gibt
- Balance zwischen Perfektion und Fortschritt finden

### Als Autor:in
- Offen für Feedback sein
- Kommentare nicht persönlich nehmen
- Bei Unklarheiten nachfragen
- Entscheidungen begründen können

## Review-Checkliste

### Codequalität
- [ ] Code ist klar und lesbar
- [ ] Hält Projektkonventionen und Styleguide ein
- [ ] Keine unnötige Komplexität
- [ ] Angemessenes Fehler-Handling
- [ ] Randfälle berücksichtigt

### Funktionalität
- [ ] Anforderungen erfüllt
- [ ] Keine Regressionen eingeführt
- [ ] Performance berücksichtigt
- [ ] Sicherheitsaspekte adressiert

### Tests
- [ ] Tests für neue Funktionalität vorhanden
- [ ] Bestehende Tests bestehen weiterhin
- [ ] Testabdeckung angemessen
- [ ] Randfälle getestet

### Dokumentation
- [ ] Wo nötig kommentiert
- [ ] API-Dokumentation aktualisiert (falls erforderlich)
- [ ] README angepasst (bei Funktionsänderungen)
- [ ] Aussagekräftige Commit-Messages

## Review-Prozess

### Timing
- Review idealerweise innerhalb von 24 Stunden
- Dringende Änderungen priorisieren
- Bei Abwesenheit an andere Reviewer weitergeben

### Kommunikation
- Klare, spezifische Sprache verwenden
- Bei Bedarf Zeilennummern referenzieren
- Alternativen vorschlagen statt nur kritisieren
- Emojis für Tonlage: 👍 🚀 ❓ ⚠️

### Freigabekriterien
- Alle Kommentare adressiert oder besprochen
- CI-Pipeline grün
- Keine blockierenden Punkte offen
- Mindestens eine genehmigte Review

## Häufige Review-Kommentare

### Muss behoben werden (Must-Fix)
- Sicherheitslücken
- Bruch bestehender Funktionalität
- Performance-Regressionen
- Architektur-Verstöße

### Sollte behoben werden (Should-Fix)
- Style-Verstöße
- Lücken in der Testabdeckung
- Verbesserungen an Dokumentation
- Hinweise auf Code Smells

### Nice-to-have
- Zusätzliche Testfälle
- Refactoring-Möglichkeiten
- Performance-Optimierungen
- UX-Verbesserungen

## Umgang mit Differenzen
- Alternativen sachlich diskutieren
- Dritte Meinung einholen, falls festgefahren
- Entscheidungen dokumentieren
- Teamkonsens hat Vorrang vor Einzelpräferenzen

## Kontinuierliche Verbesserung
- Leitfaden regelmäßig anhand von Learnings aktualisieren
- Erkenntnisse im Team teilen
- Pair Programming für komplexe Änderungen
- Review-Verantwortungen rotieren


--------------------------------
Englisches Original
--------------------------------

# Code Review Guide

This guide provides standards and best practices for conducting code reviews in the p2d2 project.

## Purpose of Code Reviews

- Improve code quality
- Share knowledge across the team
- Catch bugs early
- Ensure consistency
- Mentor junior developers

## Review Mindset

### As a Reviewer
- Be constructive and respectful
- Focus on the code, not the person
- Explain the "why" behind suggestions
- Recognize that there are multiple solutions
- Balance perfection with progress

### As an Author
- Be open to feedback
- Don't take comments personally
- Ask for clarification when needed
- Be prepared to explain your decisions

## Review Checklist

### Code Quality
- [ ] Code is clean and readable
- [ ] Follows project conventions and style guide
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] Edge cases are considered

### Functionality
- [ ] Requirements are met
- [ ] No regression introduced
- [ ] Performance considerations
- [ ] Security aspects addressed

### Testing
- [ ] Tests are included for new functionality
- [ ] Existing tests still pass
- [ ] Test coverage is adequate
- [ ] Edge cases are tested

### Documentation
- [ ] Code is well-commented where necessary
- [ ] API documentation updated if needed
- [ ] README updates if functionality changes
- [ ] Commit messages are clear

## Review Process

### Timing
- Aim to review within 24 hours
- For urgent changes, prioritize accordingly
- If unavailable, delegate to another reviewer

### Communication
- Use clear, specific language
- Reference line numbers when helpful
- Suggest alternatives, not just criticism
- Use emojis for tone: 👍 🚀 ❓ ⚠️

### Approval Criteria
- All comments addressed or discussed
- CI pipeline passes
- No blocking issues remain
- At least one approved review

## Common Review Comments

### Must-Fix
- Security vulnerabilities
- Breaking existing functionality
- Performance regressions
- Architecture violations

### Should-Fix
- Code style violations
- Test coverage gaps
- Documentation improvements
- Code smell indicators

### Nice-to-Have
- Additional test cases
- Refactoring opportunities
- Performance optimizations
- UX improvements

## Handling Disagreements
- Discuss alternatives objectively
- Seek third opinion if stuck
- Document decisions made
- Remember: team consensus over individual preference

## Continuous Improvement
- Regularly update this guide based on lessons learned
- Share interesting findings with the team
- Pair programming for complex changes
- Rotate review responsibilities
xxxxx



# Code Review Guide

This guide provides standards and best practices for conducting code reviews in the p2d2 project.

## Purpose of Code Reviews

- Improve code quality
- Share knowledge across the team
- Catch bugs early
- Ensure consistency
- Mentor junior developers

## Review Mindset

### As a Reviewer
- Be constructive and respectful
- Focus on the code, not the person
- Explain the "why" behind suggestions
- Recognize that there are multiple solutions
- Balance perfection with progress

### As an Author
- Be open to feedback
- Don't take comments personally
- Ask for clarification when needed
- Be prepared to explain your decisions

## Review Checklist

### Code Quality
- [ ] Code is clean and readable
- [ ] Follows project conventions and style guide
- [ ] No unnecessary complexity
- [ ] Proper error handling
- [ ] Edge cases are considered

### Functionality
- [ ] Requirements are met
- [ ] No regression introduced
- [ ] Performance considerations
- [ ] Security aspects addressed

### Testing
- [ ] Tests are included for new functionality
- [ ] Existing tests still pass
- [ ] Test coverage is adequate
- [ ] Edge cases are tested

### Documentation
- [ ] Code is well-commented where necessary
- [ ] API documentation updated if needed
- [ ] README updates if functionality changes
- [ ] Commit messages are clear

## Review Process

### Timing
- Aim to review within 24 hours
- For urgent changes, prioritize accordingly
- If unavailable, delegate to another reviewer

### Communication
- Use clear, specific language
- Reference line numbers when helpful
- Suggest alternatives, not just criticism
- Use emojis for tone: 👍 🚀 ❓ ⚠️

### Approval Criteria
- All comments addressed or discussed
- CI pipeline passes
- No blocking issues remain
- At least one approved review

## Common Review Comments

### Must-Fix
- Security vulnerabilities
- Breaking existing functionality
- Performance regressions
- Architecture violations

### Should-Fix
- Code style violations
- Test coverage gaps
- Documentation improvements
- Code smell indicators

### Nice-to-Have
- Additional test cases
- Refactoring opportunities
- Performance optimizations
- UX improvements

## Handling Disagreements

- Discuss alternatives objectively
- Seek third opinion if stuck
- Document decisions made
- Remember: team consensus over individual preference

## Continuous Improvement

- Regularly update this guide based on lessons learned
- Share interesting findings with the team
- Pair programming for complex changes
- Rotate review responsibilities
