export default async function handler(req, res) {
  // CORS configuration to allow your HTML to use it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // Extract song, artist, and label from the URL
  const { song, artist, label } = req.query;

  if (!song) {
    return res.status(400).json({ error: "Please provide a 'song' parameter." });
  }

  const artistName = artist || "";
  const labelName = label || "";
  
  let spotifyLink = null;
  let videoId = null;

  try {
    // ----------------------------------------------------------------------
    // 1. START YOUTUBE FETCH (Only place where Label is used)
    // ----------------------------------------------------------------------
    // Construct query. If label is empty, it just leaves a blank space.
    const rawYtQuery = `${song} ${artistName} ${labelName} official Full video`;
    // Clean up extra spaces if artist or label was missing
    const cleanYtQuery = rawYtQuery.replace(/\s+/g, ' ').trim();
    const ytQuery = encodeURIComponent(cleanYtQuery);

    const ytPromise = fetch(`https://ayushvid.vercel.app/api?q=${ytQuery}`)
      .then((r) => r.json())
      .then((data) => data.top_result?.videoId || null)
      .catch((err) => null);

    // ----------------------------------------------------------------------
    // 2. FETCH ITUNES SEARCH API (Label is NOT used here)
    // ----------------------------------------------------------------------
    const itunesQuery = encodeURIComponent(`${song} ${artistName}`.trim());
    const itunesUrl = `https://itunes.apple.com/search?term=${itunesQuery}&country=IN&media=music&entity=song&limit=10`;

    const itunesData = await fetch(itunesUrl)
      .then((r) => r.json())
      .catch(() => ({ results:[] }));

    // Use your EXACT matching logic
    const bestMatch = performMatching(itunesData.results, song, artistName);

    // ----------------------------------------------------------------------
    // 3. FETCH SPOTIFY LINK (If iTunes Match Found)
    // ----------------------------------------------------------------------
    let spotPromise = Promise.resolve(null);

    if (bestMatch && bestMatch.trackId) {
      spotPromise = fetch(`https://findspot-xi.vercel.app/api?id=${bestMatch.trackId}`)
        .then((r) => r.json())
        .then((data) => (data.success ? data.spotifyUrl : null))
        .catch(() => null);
    }

    // ----------------------------------------------------------------------
    // 4. WAIT FOR EVERYTHING TO FINISH & RETURN
    // ----------------------------------------------------------------------
    const results = await Promise.all([spotPromise, ytPromise]);
    spotifyLink = results[0];
    videoId = results[1];

    return res.status(200).json({
      spotifyLink: spotifyLink,
      videoId: videoId
    });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// =========================================================================
// EXACT MATCHING LOGIC (Untouched from your file)
// =========================================================================
function performMatching(results, targetTrack, targetArtist) {
  if (!results || results.length === 0) return null;

  const clean = (s) => (s || "").toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();
  const tTitle = clean(targetTrack);
  const tArtist = clean(targetArtist);

  let bestMatch = null;
  let highestScore = 0;

  results.forEach((item) => {
    const rTitle = clean(item.trackName); 
    const rArtists = (item.artistName || "").split(/[,&]+/).map((a) => clean(a));

    let score = 0;
    let artistMatched = false;

    if (tArtist.length > 0) {
      for (let ra of rArtists) {
        if (ra === tArtist) {
          score += 100;
          artistMatched = true;
          break;
        } else if (ra.includes(tArtist) || tArtist.includes(ra)) {
          score += 80;
          artistMatched = true;
          break;
        }
      }
      if (!artistMatched) score = 0; 
    } else {
      score += 50;
    }

    if (score > 0) {
      if (rTitle === tTitle) score += 100;
      else if (rTitle.startsWith(tTitle) || tTitle.startsWith(rTitle)) score += 80;
      else if (rTitle.includes(tTitle)) score += 50;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  });

  return highestScore > 0 ? bestMatch : null;
}
