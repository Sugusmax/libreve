import mobileAds, {
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  InterstitialAd,
} from 'react-native-google-mobile-ads';

// ID real de la unidad intersticial de AdMob: se muestra al abrir cada libro.
const AD_UNIT_ID = 'ca-app-pub-7798680358413450/3180488567';
const LOAD_TIMEOUT_MS = 4000;
const SHOW_TIMEOUT_MS = 30000;

type ConsentState = {
  adsAllowed: boolean;
  personalizationAllowed: boolean;
};

let initialized = false;
let consentState: ConsentState = {
  adsAllowed: false,
  personalizationAllowed: false,
};
let loadedAd: InterstitialAd | null = null;
let loadingAd: InterstitialAd | null = null;

/**
 * Google exige consentimiento para anuncios personalizados en EEA/UK y permite
 * NPA como alternativa. Sin consentimiento válido no se piden anuncios.
 */
async function refreshConsent(showFormIfRequired: boolean): Promise<ConsentState> {
  await AdsConsent.requestInfoUpdate({
    tagForUnderAgeOfConsent: false,
  });

  const info = showFormIfRequired
    ? await AdsConsent.loadAndShowConsentFormIfRequired()
    : await AdsConsent.getConsentInfo();

  if (!info.canRequestAds) {
    return { adsAllowed: false, personalizationAllowed: false };
  }

  if (info.status === AdsConsentStatus.NOT_REQUIRED) {
    return { adsAllowed: true, personalizationAllowed: true };
  }

  if (info.status === AdsConsentStatus.OBTAINED) {
    const choices = await AdsConsent.getUserChoices();

    return {
      adsAllowed: true,
      personalizationAllowed: choices.createAPersonalisedAdsProfile,
    };
  }

  // REQUIRED/UNKNOWN sin permiso para pedir ads: modo seguro NPA.
  return { adsAllowed: true, personalizationAllowed: false };
}

function applyConsent(next: ConsentState): void {
  consentState = next;
}

function requestOptions() {
  return consentState.personalizationAllowed
    ? {}
    : { requestNonPersonalizedAdsOnly: true };
}

function createAd(): InterstitialAd {
  const ad = InterstitialAd.createForAdRequest(AD_UNIT_ID, requestOptions());

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

function clearLoadedAd(): void {
  loadedAd = null;
  loadingAd = null;
}

async function waitForLoadedAd(): Promise<InterstitialAd | null> {
  if (loadedAd) {
    return loadedAd;
  }

  const ad = ensureAd();

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribers: Array<() => void> = [];

    const finish = (result: InterstitialAd | null) => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer !== null) {
        clearTimeout(timer);
      }

      unsubscribers.forEach((unsubscribe) => unsubscribe());
      resolve(result);
    };

    timer = setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
    unsubscribers = [
      ad.addAdEventListener(AdEventType.LOADED, () => finish(ad)),
      ad.addAdEventListener(AdEventType.ERROR, () => finish(null)),
    ];
  });
}

export async function initializeAds(): Promise<void> {
  if (initialized) {
    return;
  }

  try {
    applyConsent(await refreshConsent(true));

    if (!consentState.adsAllowed) {
      return;
    }

    await mobileAds().initialize();
    initialized = true;
    ensureAd();
  } catch {
    initialized = false;
    applyConsent({ adsAllowed: false, personalizationAllowed: false });
  }
}

/** Permite volver a decidir el consentimiento sin reinstalar la app. */
export async function openPrivacyOptions(): Promise<void> {
  try {
    applyConsent(await refreshConsent(false));

    const info = await AdsConsent.getConsentInfo();

    if (
      info.privacyOptionsRequirementStatus ===
      AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
    ) {
      await AdsConsent.showPrivacyOptionsForm();
      applyConsent(await refreshConsent(false));
    }

    // La opción de personalización puede haber cambiado: recargamos el anuncio.
    clearLoadedAd();

    if (initialized && consentState.adsAllowed) {
      ensureAd();
    }
  } catch {
    // La privacidad no debe bloquear la navegación si el formulario falla.
  }
}

export async function showBookAd(): Promise<void> {
  if (!consentState.adsAllowed) {
    return;
  }

  const ad = await waitForLoadedAd();

  if (!ad) {
    ensureAd();
    return;
  }

  clearLoadedAd();

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribers: Array<() => void> = [];

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (timer !== null) {
        clearTimeout(timer);
      }

      unsubscribers.forEach((unsubscribe) => unsubscribe());
      resolve();
    };

    timer = setTimeout(finish, SHOW_TIMEOUT_MS);
    unsubscribers = [
      ad.addAdEventListener(AdEventType.CLOSED, finish),
      ad.addAdEventListener(AdEventType.ERROR, finish),
    ];

    try {
      ad.show();
    } catch {
      finish();
    }
  });

  if (initialized && consentState.adsAllowed) {
    ensureAd();
  }
}
