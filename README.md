# Brandtex Trading Website

## Filename-driven images and descriptions

Use these exact file patterns inside `assets/`:

- `img_1.jpg` + `description_1.txt`
- `img_2.png` + `description_2.txt`
- `img_3.jpg` + `description_3.md`
- and so on

The number controls both pairing and display order. The site matches the numeric suffix, so `img_10.jpg` is placed after `img_9.jpg` and paired with `description_10.*`.

A product can exist with only an image or only a description, but the best result is a matching pair.

## Run locally

1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

## Uploading assets

You can upload files from the **Manage Product Assets** area on the page. Uploaded files are stored in `assets/` and appear automatically after the upload.

## Manual upload

You can also copy files directly into the `assets/` folder. Refresh the page and the server will scan the folder again.
