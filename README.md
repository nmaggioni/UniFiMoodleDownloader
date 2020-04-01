# UniFiMoodleDownloader

> Semplice crawler e downloader di risorse per i corsi Moodle UniFi.

## Quick start

1. `npm install`
2. Aggiungi gli ID dei tuoi corsi in [`config.json`](config.json).
3. _(Opzionale)_ Crea una copia di [`secrets.json`](secrets.json) chiamata `secrets.local.json`.
4. Imposta le tue credenziali Moodle in `secrets.local.json` (o [`secrets.json`](secrets.json) se hai saltato lo step 3).
5. `npm start`

I file saranno scaricati ed organizzati nella cartella `downloads`.

## Problemi noti

I file caricati come allegati delle sezioni dei corsi vengono scaricati con i propri nome ed estensione, ma ciò non è ugualmente possibile per i file linkati direttamente nelle descrizioni delle sezioni: per questi ultimi non è garantità l'unicità del filename e vengono perciò rinominati con un prefisso incrementale: `[ALT#n] - {nome_del_file}.{ext}`.

## Downloaders alternativi

In caso di problemi con il downloader integrato (carico eccessivo della piattaforma Moodle, problemi di encoding...) è possibile impostare `config.json["downloader"] = "aria2"`.

In questo modo i file non verranno scaricati direttamente ma verrà invece creato un file `aria2c_input.txt` che potrà essere passato ad [`aria2`](https://aria2.github.io/) per il download parallelo:
> `aria2c -x 16 -j 16 -c -i ./aria2c_input.txt`
