import mobileAds, {
  AdEventType,
  InterstitialAd,
  TestIds,
} from 'react-native-google-mobile-ads';

// IDs de prueba oficiales de Google. Sustituir por los IDs reales de AdMob
// cuando la app tenga cuenta propia y el anuncio vaya a monetizar de verdad.
const AD_UNIT_ID = TestIds.INTERSTITIAL;
const LOAD_TIMEOUT_MS = 4000;
const SHOW_TIMEOUT_MS = 30000;

let initialized = false;
let loadedAd: InterstitialAd | null = null;
let loadingAd: InterstitialAd | null = null;

function createAd(): InterstitialAd {
  const ad = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
    requestNonPersonalizedAdsOnly: true,
  });

  ad.addAdEventListener(AdEventType.LOADED, () => {
    loadedAd = ad;
    loadingAd = null;
  });

  ad.addAdEventListener(AdEventType.ERROR, () => {
    if (loadedAd === ad) {
      loadedAd = null;
    }

    if (loadingAd === ad) {
      loadingAd = null;
    }
  });

  ad.load();
  return ad;
}

function ensureAd(): InterstitialAd {
  if (loadedAd) {
    return loadedAd;
  }

  if (!loadingAd) {
    loadingAd = createAd();
  }

  return loadingAd;
}

async function waitForLoadedAd(): Promise<InterstitialAd | null> {
  if (loadedAd) {
    return loadedAd;
  }

  const ad = ensureAd();

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: InterstitialAd | null) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer !== null) {
        clearTimeout(timer);
      }

      resolve(result);
    };

    timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    ad.addAdEventListener(AdEventType.LOADED, () => finish(ad));
    ad.addAdEventListener(AdEventType.ERROR, () => finish(null));
  });
}

export async function initializeAds(): Promise<void> {
  if (initialized) {
    return;
  }

  initialized = true;

  try {
    await mobileAds().initialize();
    ensureAd();
  } catch {
    initialized = false;
  }
}

export async function showBookAd(): Promise<void> {
  const ad = await waitForLoadedAd();

  if (!ad) {
    ensureAd();
    return;
  }

  if (loadedAd === ad) {
    loadedAd = null;
  }

  if (loadingAd === ad) {
    loadingAd = null;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer !== null) {
        clearTimeout(timer);
      }

      resolve();
    };

    timer = setTimeout(finish, SHOW_TIMEOUT_MS);
    ad.addAdEventListener(AdEventType.CLOSED, finish);
    ad.addAdEventListener(AdEventType.ERROR, finish);

    try {
      ad.show();
    } catch {
      finish();
    }
  });

  ensureAd();
}
