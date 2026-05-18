## PackageScrubber - MVP

### Główny problem
Zamawiam sporo paczek głównie na Allegro i Aliexpress. Chce stworzyć aplikację, która będzie listować wszystkie moje paczki. Paczki pobierane będą przez skanowanie Gmaila poprzez GmailAPI (lub ręcznie). Statusy w MVP mogą działać jako samo pokazanie linka do trackingu.

### Najmniejszy zestaw funkcjonalności
- Logowanie przez Google OAuth wraz z dostepem do Gmail API
- Pobieranie paczek poprzez przegląd Gmaila (sprawdzanie maili z konkretneych adresów z Aliexpress oraz Allegro). Planuje tu użyć AI do wynajdywania numerów paczek i typu dostawcy (i dodanie opisu paczki, jeżeli to sie okaże proste)
- Przeglądanie paczek i możliwość edycji danych paczki.
- Manualne dodawanie paczek
- Usuwanie paczek. System powienien ogarniać, że jakaś paczka została usunięta i nie dodawać jej ponownie przy kolejnym skanowaniu Gmaila.
- Automatyczne dodawanie linków do stron trackujących paczki wg. wzorca (dla Inpostu, Poczty Polskiej, DPD i DHL). Możliwość ręcznej edycji tych linków.
- Prosty płaski system kont użytkowników

### Co NIE wchodzi w zakres MVP
- Pobieranie statusów paczek przez API dostawców (trudne, często zamknięte API)
- Cykliczne odświeżanie listy paczek z Gmaila - powinno działać tylko on-demand po kliknięciu "Sync"
- Wsparcie urządzeń mobilnych - ma działać tylko na komputerach
- Aplikacja będzie hostowana tylko lokalnie (nie będzie wystawiona publicznie) w kontenerach dockerowych.

### Kryteria sukcesu
- 75% paczek jest poprawnie zaimportowana z Gmaila i wyświetlona w aplikacji.
- Linki trackujące działają