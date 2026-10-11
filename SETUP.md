# Inbox — setup, step by step

About 20 minutes, once. Parts A and B are on your computer, part C on your phone.

---

## Part A — Put the app online (GitHub Pages, free)

1. Go to **https://github.com** and sign in (or click **Sign up** and create a free account).
2. Top-right, click **+** → **New repository**.
3. **Repository name:** `phrase-inbox` · choose **Public** · leave everything else as is → **Create repository**.
4. On the new, empty repository page, click the link **uploading an existing file**.
5. Open the `phrase-inbox` folder on your computer in File Explorer. Press **Ctrl+A** to select
   everything inside it, and **drag** it all onto the GitHub page.
   (Drag the *contents*, so `index.html` is at the top level, not inside another folder.)
6. Wait until all files are listed, then click the green **Commit changes** button.
7. Click **Settings** (top of the repository) → **Pages** (left menu).
8. Under **Build and deployment → Source** choose **Deploy from a branch**.
   Under **Branch** choose **main** and **/ (root)** → **Save**.
9. Wait 1–2 minutes and refresh. The page shows **"Your site is live at
   https://drendoral.github.io/inbox/"**. That's your app address.

> The repository is public, but it holds no secrets: your script URL and token
> live only on your phone.

---

## Part B — Connect the app to your Google Doc (Apps Script)

### B1. Paste the code

1. Open your doc **daily in doc 001** in Google Docs on the computer.
2. Menu **Extensions → Apps Script**. A new tab opens with a file called `Code.gs`.
3. Click inside the code area, press **Ctrl+A**, then **Delete** (remove the sample code).
4. Open `apps-script/Code.gs` from the `phrase-inbox` folder (Notepad is fine), **Ctrl+A**, **Ctrl+C**,
   then click in the Apps Script editor and **Ctrl+V**.
5. Click the **Save** icon (floppy disk) or press **Ctrl+S**.
6. Optional: click **Untitled project** at the top and rename it to `Inbox`.

### B2. Run setup once (creates your token)

1. In the toolbar, the dropdown next to **Debug** shows a function name. Choose **setup**.
2. Click **Run**.
3. A box says **Authorization required** → **Review permissions** → choose your Google account.
4. You'll see **"Google hasn't verified this app"**. That's normal for your own script.
   Click **Advanced** → **Go to Inbox (unsafe)** → **Allow**.
5. The **Execution log** opens at the bottom. Find the line
   **`YOUR TOKEN (copy this into the app): ...`** and copy the long code after it.
   (Lost it? Choose **showToken** in the dropdown and click **Run**.)

### B3. Deploy as a web app

1. Top-right: **Deploy → New deployment**.
2. Next to **Select type**, click the **gear icon** → **Web app**.
3. **Description:** `Inbox`
   **Execute as:** **Me (your email)**
   **Who has access:** **Anyone**
4. Click **Deploy** (click **Authorize access** and **Allow** again if asked).
5. Copy the **Web app URL**. It starts with `https://script.google.com/macros/s/` and ends with `/exec`.

### B4. Get the two values to your phone

Paste the **URL** and the **token** into a Google Keep note (or email them to yourself).
After part C works, delete that note.

> **If you change the code later:** Deploy → **Manage deployments** → pencil icon →
> **Version: New version** → **Deploy**. The URL stays the same.

---

## Part C — Install on your Samsung (Chrome)

1. On the phone, open **Chrome** (not Samsung Internet) and go to
   `https://drendoral.github.io/inbox/`.
2. The **Connect to your Google Doc** box appears. Paste the **Script URL** and **Token** →
   **Test & save**. It should say **Connected to "daily in doc 001"**.
3. Tap Chrome's **⋮** menu (top-right) → **Add to home screen** → **Install**
   (on some versions it's called **Install app** directly) → **Install** again to confirm.
4. Open **Inbox** from your home screen. It opens full-screen like a normal app.
5. The first time you hold the **mic**, Chrome asks to use the microphone → **Allow**.

**Sharing into the app:** in any app, select text → **Share** → **Inbox**
(on Samsung you may need to swipe the share sheet up or tap **More** the first time).

**Test from the phone:**
1. Type `test from phone` → **Post**. It shows **Sent ✓** in the list.
2. Open the doc: the last line is `test from phone [Couldn't say] [] [date time] ⟨abc12345⟩`.
3. In the app, tap the entry → **Delete** → **OK**. The line disappears from the doc.
4. Press and **hold** the 🎙 mic, say `this is a voice test`, let go → **Post**.

---

## Good to know

- **The ☰ menu** shows **"N waiting in your doc"** (how many non-empty lines are in the doc) and how many entries are still on the phone, not yet sent.
- **Tags are automatic:** short names of things → *Word for a thing*; work words (meeting, client,
  report, touch base…) → *Work*; everything else → *Couldn't say*. Tap an entry to see its tag.
- **Voice:** hold the mic the whole time you speak. It needs internet.
- **Offline:** entries are saved on the phone and sent automatically when you're back online.
- **Wrong token** or **changed URL** → **☰ → Connection settings**.
- **New token** (if you think it leaked): Apps Script → run **resetToken** → put the new token in the app.
- **The keyboard doesn't pop up when the app opens:** Android only shows the keyboard after a tap
  in some cases. The box is already focused, so one tap on it is enough.
