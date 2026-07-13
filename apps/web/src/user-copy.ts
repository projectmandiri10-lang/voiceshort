import type { ContentLanguage } from "./types";

export interface UserCopy {
  app: {
    tabs: {
      generate: string;
      deposit: string;
      jobs: string;
      settings: string;
      admin: string;
    };
    loadingEyebrow: string;
    loadingNote: string;
    disabledEyebrow: string;
    disabledTitle: string;
    disabledFallback: string;
    logout: string;
  };
  dashboard: {
    mainWorkspace: string;
    navigation: string;
    defaultPage: string;
    balance: string;
    unlimited: string;
    unlimitedNote: string;
    remainingGenerates: (count: number) => string;
    admin: string;
    user: string;
  };
  landing: {
    authErrorGoogleFailed: string;
    authErrorGoogleInvalid: string;
    googleUnavailable: string;
    redirectingGoogle: string;
    navHowItWorks: string;
    navPricing: string;
    navLogin: string;
    badge: string;
      heroTitle: string;
      heroTitleAccent: string;
      heroTitleTail: string;
      heroLead: string;
    statSpeed: string;
    statSpeedNote: string;
    statPayment: string;
    statPaymentNote: string;
    statLocal: string;
    statLocalNote: string;
    ctaPricing: string;
    ctaHowItWorks: string;
    authTitle: string;
    authLead: string;
    googleLogin: string;
    googleRedirecting: string;
    authHelper: string;
    authDivider: string;
    authMode: string;
    login: string;
    register: string;
    name: string;
    namePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    submitting: string;
    createAccount: string;
    securityData: string;
    securitySpam: string;
    howItWorksBadge: string;
    howItWorksTitle: string;
    howItWorksLead: string;
    pricingBadge: string;
    pricingTitle: string;
    pricingLead: string;
    pricingButton: string;
    privacy: string;
    privacyNote: string;
    usage: string;
    usageNote: string;
      footerRights: string;
      footerHelp: string;
      footerContact: string;
    featureSteps: Array<{
      title: string;
      description: string;
    }>;
    package: {
      price: string;
      quota: string;
      note: string;
      badge: string;
    };
  };
  deposit: {
    eyebrow: string;
    title: string;
    lead: (generatePrice: string) => string;
    loadingBalance: string;
    unlimitedBalance: string;
    unlimitedNote: string;
    remainingEstimate: (count: number) => string;
    activeBalance: string;
    selectPackage: string;
    selectPackageLead: string;
    balanceHistory: string;
    latestTransactions: (count: number) => string;
    checkoutEyebrow: string;
    defaultPackage: string;
    checkoutLead: (credit: string, count: number) => string;
    showQris: string;
    preparingQris: string;
    qrisUnavailable: string;
    payAmount: string;
    status: string;
    expired: string;
    invoiceNumber: string;
    paymentReceived: string;
    noInvoice: string;
    noInvoiceLead: string;
    creditPrefix: string;
    bonusPrefix: string;
  };
  generate: {
    idleLabel: string;
    insufficientBalance: string;
    readyProcess: string;
    completeForm: string;
    flowCompleted: string;
    flowWaiting: string;
    flowProcessing: string;
    flowRenderReady: string;
    flowIdleLead: string;
    connectedSession: string;
    continueLocal: string;
    openHistory: string;
    continuing: string;
    continueFinalize: string;
    uploadSection: string;
    mainVideo: string;
    uploadLead: string;
    slotReady: string;
    incomplete: string;
    video: string;
    chooseVideo: string;
    uploadHint: string;
    chooseFile: string;
    duration: string;
    reading: string;
    cost: string;
    mode: string;
    flatPerProcess: string;
    detailsSection: string;
    detailsTitle: string;
    detailsLead: string;
    generateMode: string;
    generateModeHint: string;
    title: string;
    titlePlaceholder: string;
    manualScript: string;
    manualScriptPlaceholder: string;
    manualScriptHint: string;
    description: string;
    descriptionPlaceholder: string;
    contentCategory: string;
    socialPlatform: string;
    subtitleMode: string;
    subtitleModeHint: string;
    voiceGender: string;
    tone: string;
    optionalCta: string;
    optionalCtaPlaceholder: string;
    optionalReference: string;
    actionNoteUnlimited: string;
    actionNoteMetered: (amount: string) => string;
    processVideo: string;
    summary: string;
    workflowStatus: string;
    activeStep: string;
    visualClips: string;
    automatic: string;
    finalization: string;
    costBalance: string;
    sessionCost: string;
    remainingBalance: string;
    unlimitedBalance: string;
    balanceStatus: string;
    balanceReady: string;
    needTopup: string;
    unlimitedLead: string;
    flatGeneratePrice: (amount: string) => string;
    aiSession: string;
    pipelineStatus: string;
    voice: string;
    defaultVoice: string;
    sourceScript: string;
    analyzedClips: string;
    targetPlatform: string;
    captionPrefix: string;
    finalReadyTitle: string;
    finalReadyLead: (sizeMb: string) => string;
    downloadFinal: string;
    openHistoryShort: string;
    validateTopup: string;
    validateFile: string;
    validateDurationPending: string;
    validateDurationInvalid: string;
    validateFormManual: string;
    validateFormAuto: string;
    durationTooLong: string;
    durationUnreadable: string;
    preparingManual: string;
    analyzingVideo: string;
    generatingManual: string;
    generatingAuto: string;
    fetchingAudio: string;
    rendering: string;
    renderingProgress: string;
    localDraftFound: string;
    localDraftMissing: string;
    localSessionOnly: string;
    downloadAgain: string;
  };
  jobs: {
    loadingTitle: string;
    loadingLead: string;
    eyebrow: string;
    title: string;
    lead: string;
    refresh: string;
    listTitle: string;
    items: (count: number) => string;
    cachedDraft: string;
    noCache: string;
    empty: string;
    selectPrompt: string;
    detailEyebrow: string;
    detailTitle: string;
    detailLead: string;
    manualScript: string;
    subtitleMode: string;
    clips: (count: number) => string;
    localDraftAvailable: string;
    localDraftUnavailable: string;
    mode: string;
    category: string;
    platform: string;
    voiceGender: string;
    tone: string;
    videoDuration: string;
    cost: string;
    brief: string;
    cta: string;
    reference: string;
    scriptTitle: string;
    captionTitle: string;
    finalized: string;
    completed: string;
    notYet: string;
    fileSize: string;
    finalDuration: string;
    openWorkspace: string;
    continueFinalize: string;
    localDraftNeeded: string;
    finalUnavailable: string;
    downloadFinal: string;
  };
}

export const USER_COPY: Record<ContentLanguage, UserCopy> = {
  "id-ID": {
    app: {
      tabs: {
        generate: "Generate",
        deposit: "Isi Saldo",
        jobs: "Riwayat",
        settings: "Pengaturan",
        admin: "Admin"
      },
      loadingEyebrow: "Booting Workspace",
      loadingNote: "Memuat akun Anda...",
      disabledEyebrow: "Akun Nonaktif",
      disabledTitle: "Akun Anda sedang dinonaktifkan",
      disabledFallback: "Hubungi admin VoiceOver Shorts 60 jika Anda merasa akun ini perlu diaktifkan kembali.",
      logout: "Logout"
    },
    dashboard: {
      mainWorkspace: "Workspace utama",
      navigation: "Dashboard navigation",
      defaultPage: "Halaman",
      balance: "Saldo",
      unlimited: "Unlimited",
      unlimitedNote: "Akun tanpa batas",
      remainingGenerates: (count) => `${count} generate tersisa`,
      admin: "Admin",
      user: "Pengguna"
    },
    landing: {
      authErrorGoogleFailed: "Masuk dengan Google belum berhasil. Coba lagi sebentar.",
      authErrorGoogleInvalid: "Proses masuk Google tidak lengkap. Silakan ulangi dari tombol Google.",
      googleUnavailable: "Masuk Google belum tersedia saat ini. Silakan coba masuk dengan email atau hubungi admin.",
      redirectingGoogle: "Mengarahkan Anda ke Google...",
      navHowItWorks: "Cara Kerja",
      navPricing: "Paket Saldo",
      navLogin: "Masuk",
      badge: "AI Voice Over Generator",
      heroTitle: "Bikin pengisi suara video short",
      heroTitleAccent: "dengan cepat",
      heroTitleTail: "dan rapi.",
      heroLead: "Unggah video, tulis arahan singkat. Voiceshort menyiapkan narasi berbahasa Indonesia yang siap diposting ke TikTok, Reels, dan Shorts.",
      statSpeed: "< 2 Menit",
      statSpeedNote: "Proses rata-rata",
      statPayment: "Rp2.000",
      statPaymentNote: "Pembayaran via QRIS",
      statLocal: "Client-first",
      statLocalNote: "Diproses lokal",
      ctaPricing: "Lihat Paket Saldo",
      ctaHowItWorks: "Cara kerja",
      authTitle: "Masuk Sekarang",
      authLead: "Akses workspace Anda untuk mulai generate voice over.",
      googleLogin: "Masuk dengan Google",
      googleRedirecting: "Mengarahkan ke Google...",
      authHelper: "Cara tercepat - tanpa perlu ingat password.",
      authDivider: "atau email",
      authMode: "Authentication mode",
      login: "Masuk",
      register: "Daftar Akun",
      name: "Nama",
      namePlaceholder: "Nama Anda",
      email: "Email",
      emailPlaceholder: "nama@email.com",
      password: "Password",
      passwordPlaceholder: "Minimal 8 karakter",
      submitting: "Memproses...",
      createAccount: "Buat Akun",
      securityData: "Data aman",
      securitySpam: "No spam",
      howItWorksBadge: "Cara Kerja",
      howItWorksTitle: "Tiga langkah, sudah jadi.",
      howItWorksLead: "Tidak perlu software tambahan. Semua berjalan otomatis di perangkat Anda.",
      pricingBadge: "Pembayaran QRIS",
      pricingTitle: "Bayar Rp2.000 untuk pengisi suara AI realistis",
      pricingLead: "Transaksi cepat, aman, dan saldo masuk otomatis setelah pembayaran berhasil.",
      pricingButton: "Bayar via QRIS",
      privacy: "Privasi",
      privacyNote: "Kami menyimpan data akun dan metadata session. Video asli tetap di perangkat Anda. Data tidak dijual ke pihak lain.",
      usage: "Aturan Penggunaan",
      usageNote: "Pastikan video yang Anda unggah memang boleh digunakan. Hindari spam, penyalahgunaan, dan konten yang melanggar aturan platform.",
      footerRights: "© 2024 Voiceshort AI. All rights reserved.",
      footerHelp: "Bantuan",
      footerContact: "Kontak",
      featureSteps: [
        {
          title: "1. Unggah Video",
          description: "Upload file MP4/MOV, sistem membaca durasi dan menghitung estimasi biaya otomatis."
        },
        {
          title: "2. Tulis Arahan",
          description: "Isi brief singkat. Tone, gaya narasi, dan CTA disusun ke script serta audio TTS."
        },
        {
          title: "3. Unduh Hasil",
          description: "Final MP4 disiapkan otomatis, lengkap dengan caption dan voice over siap posting."
        }
      ],
      package: {
        price: "Rp2.000",
        quota: "Pengisi suara AI realistis",
        note: "Bayar sekali untuk satu generate dengan pembayaran QRIS yang cepat dan otomatis.",
        badge: "Single Card"
      }
    },
    deposit: {
      eyebrow: "Isi Saldo",
      title: "Isi saldo lewat QRIS dengan pembayaran otomatis.",
      lead: (generatePrice) => `Biaya pembuatan voice over saat ini ${generatePrice} per generate. Satu generate mencakup satu alur AI + render lokal.`,
      loadingBalance: "Memuat saldo...",
      unlimitedBalance: "Saldo Unlimited",
      unlimitedNote: "Akun whitelist dapat memproses video tanpa batas saldo.",
      remainingEstimate: (count) => `Estimasi sisa generate: ${count} kali.`,
      activeBalance: "Saldo aktif",
      selectPackage: "Pilih paket saldo",
      selectPackageLead: "Semua paket langsung menambah kredit ke akun yang sedang aktif untuk billing flat per generate.",
      balanceHistory: "Riwayat saldo",
      latestTransactions: (count) => `${count} transaksi terakhir`,
      checkoutEyebrow: "Checkout QRIS",
      defaultPackage: "Paket saldo",
      checkoutLead: (credit, count) => `Kredit saldo ${credit} untuk estimasi ${count} generate.`,
      showQris: "Tampilkan QRIS",
      preparingQris: "Menyiapkan QRIS...",
      qrisUnavailable: "QRIS belum tersedia.",
      payAmount: "Nominal Bayar",
      status: "Status",
      expired: "Expired",
      invoiceNumber: "No. invoice",
      paymentReceived: "Pembayaran diterima. Saldo sudah ditambahkan.",
      noInvoice: "Belum ada invoice aktif",
      noInvoiceLead: "Pilih paket di kiri lalu tekan tombol QRIS untuk membuat invoice pembayaran baru.",
      creditPrefix: "Saldo",
      bonusPrefix: "bonus"
    },
    generate: {
      idleLabel: "Siap mulai generate",
      insufficientBalance: "Saldo belum cukup",
      readyProcess: "Siap proses",
      completeForm: "Lengkapi form",
      flowCompleted: "Final siap",
      flowWaiting: "Menunggu",
      flowProcessing: "Memproses",
      flowRenderReady: "Selesai",
      flowIdleLead: "Video lokal akan dianalisis otomatis lalu hasil final dirakit tanpa detail teknis yang ditampilkan.",
      connectedSession: "Session tersambung",
      continueLocal: "Lanjut lokal",
      openHistory: "Buka Riwayat Session",
      continuing: "Melanjutkan...",
      continueFinalize: "Lanjutkan Finalisasi",
      uploadSection: "Upload Video",
      mainVideo: "Video Utama",
      uploadLead: "Video tetap di perangkat Anda dan hanya dipakai untuk analisis lokal.",
      slotReady: "Siap",
      incomplete: "Belum Lengkap",
      video: "Video",
      chooseVideo: "Pilih video (.mp4 / .mov)",
      uploadHint: "Maksimal 60 detik. Video akan dianalisis otomatis untuk mengambil cuplikan penting.",
      chooseFile: "Pilih File",
      duration: "Durasi",
      reading: "Membaca...",
      cost: "Biaya",
      mode: "Mode",
      flatPerProcess: "Flat per proses",
      detailsSection: "Isi Detail",
      detailsTitle: "Detail Voice Over",
      detailsLead: "Lengkapi arahan utama agar naskah dan audio lebih akurat.",
      generateMode: "Mode Generate",
      generateModeHint: "Platform medsos akan dipakai AI untuk semua jenis video, bukan hanya affiliate.",
      title: "Judul",
      titlePlaceholder: "Judul singkat untuk hasil voice over",
      manualScript: "Script Video Manual",
      manualScriptPlaceholder: "Tulis script voice over final yang ingin langsung dipakai untuk audio dan render",
      manualScriptHint: "Mode ini melewati analisa visual otomatis dan memakai script Anda sebagai sumber utama.",
      description: "Brief / Deskripsi",
      descriptionPlaceholder: "Tulis arahan utama, angle promosi, atau narasi yang diinginkan",
      contentCategory: "Kategori Konten",
      socialPlatform: "Platform Medsos",
      subtitleMode: "Subtitle Video",
      subtitleModeHint: "Pilih apakah final MP4 perlu subtitle yang ikut dibakar ke video.",
      voiceGender: "Gender Suara",
      tone: "Tone",
      optionalCta: "CTA Opsional",
      optionalCtaPlaceholder: "Contoh: cek detailnya sekarang",
      optionalReference: "Link Referensi Opsional",
      actionNoteUnlimited: "Akun ini dapat memproses video tanpa potong saldo.",
      actionNoteMetered: (amount) => `Biaya per proses ${amount}. Riwayat tersedia di tab Riwayat.`,
      processVideo: "Proses Video",
      summary: "Ringkasan",
      workflowStatus: "Status Workflow",
      activeStep: "Langkah aktif",
      visualClips: "Cuplikan visual",
      automatic: "Otomatis",
      finalization: "Finalisasi",
      costBalance: "Biaya & Saldo",
      sessionCost: "Biaya session ini",
      remainingBalance: "Sisa saldo",
      unlimitedBalance: "Saldo Unlimited",
      balanceStatus: "Status saldo",
      balanceReady: "Siap diproses",
      needTopup: "Perlu isi saldo",
      unlimitedLead: "Akun ini dapat generate tanpa pengurangan saldo.",
      flatGeneratePrice: (amount) => `Harga flat per generate: ${amount}.`,
      aiSession: "Session AI",
      pipelineStatus: "Status",
      voice: "Voice",
      defaultVoice: "Default",
      sourceScript: "Sumber naskah",
      analyzedClips: "Cuplikan visual dianalisis",
      targetPlatform: "Platform target",
      captionPrefix: "Caption",
      finalReadyTitle: "Final video siap",
      finalReadyLead: (sizeMb) => `File MP4 sudah dirakit di perangkat ini. Ukuran saat ini ${sizeMb}.`,
      downloadFinal: "Unduh Final MP4",
      openHistoryShort: "Buka Riwayat",
      validateTopup: "Saldo belum cukup. Isi saldo dulu sebelum mulai generate.",
      validateFile: "File video wajib diisi.",
      validateDurationPending: "Durasi video masih dibaca. Tunggu sebentar lalu coba lagi.",
      validateDurationInvalid: "Durasi video belum valid. Maksimum 60 detik.",
      validateFormManual: "Form belum lengkap. Pastikan video, judul, script manual, kategori, platform, gender, dan tone sudah siap.",
      validateFormAuto: "Form belum lengkap. Pastikan video, judul, brief, kategori, platform, gender, dan tone sudah siap.",
      durationTooLong: "Durasi video melebihi batas 60 detik. Pilih video yang lebih singkat.",
      durationUnreadable: "Durasi video tidak bisa dibaca.",
      preparingManual: "Menyiapkan script manual",
      analyzingVideo: "Menganalisis video",
      generatingManual: "Menyusun caption dan rencana suara",
      generatingAuto: "Menyusun naskah, caption, dan rencana suara",
      fetchingAudio: "Mengambil audio utama",
      rendering: "Menyusun file final",
      renderingProgress: "Menyusun file final",
      localDraftFound: "Draft final untuk session ini ditemukan. Anda bisa unduh ulang atau buat ulang.",
      localDraftMissing: "Draft lokal untuk session ini ditemukan. Anda bisa melanjutkan finalisasi tanpa generate ulang.",
      localSessionOnly: "Session AI tersimpan, tetapi media lokal belum ada di perangkat ini.",
      downloadAgain: "Anda bisa unduh ulang atau buat ulang."
    },
    jobs: {
      loadingTitle: "Riwayat Session",
      loadingLead: "Memuat riwayat session...",
      eyebrow: "Riwayat Session",
      title: "Riwayat Generate",
      lead: "Lihat hasil AI, status proses, dan lanjutkan session dari perangkat yang sama.",
      refresh: "Muat Ulang",
      listTitle: "Daftar Session",
      items: (count) => `${count} item`,
      cachedDraft: "Draft lokal tersedia",
      noCache: "Tanpa cache lokal",
      empty: "Belum ada session yang tersimpan.",
      selectPrompt: "Pilih session untuk melihat detailnya.",
      detailEyebrow: "Detail Session",
      detailTitle: "Detail Generate",
      detailLead: "Final video disimpan di perangkat yang sama, bukan di server pusat.",
      manualScript: "Script manual",
      subtitleMode: "Subtitle",
      clips: (count) => `${count} cuplikan`,
      localDraftAvailable: "Perangkat ini masih menyimpan draft lokal untuk session ini.",
      localDraftUnavailable: "Tidak ada cache lokal di perangkat ini. Anda masih bisa melihat hasil AI, tetapi tidak bisa render ulang tanpa upload video lagi.",
      mode: "Mode",
      category: "Kategori",
      platform: "Platform",
      voiceGender: "Gender Suara",
      tone: "Tone",
      videoDuration: "Durasi Video",
      cost: "Biaya",
      brief: "Brief",
      cta: "CTA",
      reference: "Link Referensi",
      scriptTitle: "Naskah Voice Over",
      captionTitle: "Caption Sosial",
      finalized: "Finalisasi",
      completed: "Selesai",
      notYet: "Belum ada",
      fileSize: "Ukuran File",
      finalDuration: "Durasi Final",
      openWorkspace: "Buka di Workspace Generate",
      continueFinalize: "Lanjutkan Finalisasi",
      localDraftNeeded: "Perlu Draft Lokal",
      finalUnavailable: "Final Belum Ada",
      downloadFinal: "Unduh Final"
    }
  },
  "en-US": {
    app: {
      tabs: {
        generate: "Generate",
        deposit: "Balance",
        jobs: "History",
        settings: "Pengaturan",
        admin: "Admin"
      },
      loadingEyebrow: "Booting Workspace",
      loadingNote: "Loading your account...",
      disabledEyebrow: "Account Disabled",
      disabledTitle: "Your account is currently disabled",
      disabledFallback: "Contact the VoiceOver Shorts 60 admin if this account should be reactivated.",
      logout: "Logout"
    },
    dashboard: {
      mainWorkspace: "Main workspace",
      navigation: "Dashboard navigation",
      defaultPage: "Page",
      balance: "Balance",
      unlimited: "Unlimited",
      unlimitedNote: "Unlimited account",
      remainingGenerates: (count) => `${count} generates left`,
      admin: "Admin",
      user: "User"
    },
    landing: {
      authErrorGoogleFailed: "Google sign-in was not successful. Please try again in a moment.",
      authErrorGoogleInvalid: "The Google sign-in flow was incomplete. Please retry from the Google button.",
      googleUnavailable: "Google sign-in is not available right now. Please use email sign-in or contact the admin.",
      redirectingGoogle: "Redirecting you to Google...",
      navHowItWorks: "How It Works",
      navPricing: "Balance Packs",
      navLogin: "Sign In",
      badge: "AI Voice Over Generator",
      heroTitle: "Create short-form video voice overs",
      heroTitleAccent: "faster",
      heroTitleTail: "and cleanly.",
      heroLead: "Upload a video, add a short brief, and Voiceshort prepares English-ready narration for TikTok, Reels, and Shorts.",
      statSpeed: "< 2 Minutes",
      statSpeedNote: "Average process time",
      statPayment: "IDR 2,000",
      statPaymentNote: "Paid via QRIS",
      statLocal: "Client-first",
      statLocalNote: "Processed locally",
      ctaPricing: "See Balance Packs",
      ctaHowItWorks: "How it works",
      authTitle: "Sign In Now",
      authLead: "Access your workspace and start generating voice overs.",
      googleLogin: "Continue with Google",
      googleRedirecting: "Redirecting to Google...",
      authHelper: "Fastest option with no password to remember.",
      authDivider: "or email",
      authMode: "Authentication mode",
      login: "Sign In",
      register: "Create Account",
      name: "Name",
      namePlaceholder: "Your name",
      email: "Email",
      emailPlaceholder: "name@email.com",
      password: "Password",
      passwordPlaceholder: "Minimum 8 characters",
      submitting: "Processing...",
      createAccount: "Create Account",
      securityData: "Secure data",
      securitySpam: "No spam",
      howItWorksBadge: "How It Works",
      howItWorksTitle: "Three steps and you're done.",
      howItWorksLead: "No extra software required. Everything runs automatically on your device.",
      pricingBadge: "QRIS Payment",
      pricingTitle: "Pay IDR 2,000 for realistic AI voice over",
      pricingLead: "Fast, secure payments with automatic balance credit after payment succeeds.",
      pricingButton: "Pay with QRIS",
      privacy: "Privacy",
      privacyNote: "We store account data and session metadata. Your original video stays on your device. Data is never sold to third parties.",
      usage: "Usage Rules",
      usageNote: "Make sure you have the right to use the uploaded video. Avoid spam, misuse, and content that violates platform rules.",
      footerRights: "© 2024 Voiceshort AI. All rights reserved.",
      footerHelp: "Help",
      footerContact: "Contact",
      featureSteps: [
        {
          title: "1. Upload Video",
          description: "Upload an MP4 or MOV file. The system reads the duration and estimates the cost automatically."
        },
        {
          title: "2. Add Guidance",
          description: "Write a short brief. Tone, narrative style, and CTA are turned into script and TTS audio."
        },
        {
          title: "3. Download Result",
          description: "The final MP4 is assembled automatically with captions and voice over ready to publish."
        }
      ],
      package: {
        price: "IDR 2,000",
        quota: "Realistic AI voice over",
        note: "Pay once for one generate flow with fast automatic QRIS payment.",
        badge: "Single Card"
      }
    },
    deposit: {
      eyebrow: "Balance",
      title: "Top up your balance with automatic QRIS payment.",
      lead: (generatePrice) => `The current voice over cost is ${generatePrice} per generate. One generate includes one AI flow plus local rendering.`,
      loadingBalance: "Loading balance...",
      unlimitedBalance: "Unlimited Balance",
      unlimitedNote: "Whitelisted accounts can process videos without a balance limit.",
      remainingEstimate: (count) => `Estimated remaining generates: ${count}.`,
      activeBalance: "Balance active",
      selectPackage: "Choose a balance pack",
      selectPackageLead: "Every pack instantly adds credit to the active account for flat per-generate billing.",
      balanceHistory: "Balance history",
      latestTransactions: (count) => `${count} latest transactions`,
      checkoutEyebrow: "QRIS Checkout",
      defaultPackage: "Balance pack",
      checkoutLead: (credit, count) => `${credit} balance credit for an estimated ${count} generates.`,
      showQris: "Show QRIS",
      preparingQris: "Preparing QRIS...",
      qrisUnavailable: "QRIS is not available yet.",
      payAmount: "Amount Due",
      status: "Status",
      expired: "Expires",
      invoiceNumber: "Invoice no.",
      paymentReceived: "Payment received. Your balance has been added.",
      noInvoice: "No active invoice yet",
      noInvoiceLead: "Choose a pack on the left, then click the QRIS button to create a new payment invoice.",
      creditPrefix: "Balance",
      bonusPrefix: "bonus"
    },
    generate: {
      idleLabel: "Ready to generate",
      insufficientBalance: "Insufficient balance",
      readyProcess: "Ready to process",
      completeForm: "Complete the form",
      flowCompleted: "Final ready",
      flowWaiting: "Waiting",
      flowProcessing: "Processing",
      flowRenderReady: "Done",
      flowIdleLead: "Your local video will be analyzed automatically, then the final output will be assembled without showing technical details.",
      connectedSession: "Session connected",
      continueLocal: "Continue locally",
      openHistory: "Open Session History",
      continuing: "Continuing...",
      continueFinalize: "Continue Finalizing",
      uploadSection: "Upload Video",
      mainVideo: "Main Video",
      uploadLead: "The video stays on your device and is only used for local analysis.",
      slotReady: "Ready",
      incomplete: "Incomplete",
      video: "Video",
      chooseVideo: "Choose a video (.mp4 / .mov)",
      uploadHint: "Maximum 60 seconds. The video will be analyzed automatically to capture key visual clips.",
      chooseFile: "Choose File",
      duration: "Duration",
      reading: "Reading...",
      cost: "Cost",
      mode: "Mode",
      flatPerProcess: "Flat per process",
      detailsSection: "Fill Details",
      detailsTitle: "Voice Over Details",
      detailsLead: "Complete the main guidance so the script and audio are more accurate.",
      generateMode: "Generate Mode",
      generateModeHint: "The social platform is used by AI for every video type, not only affiliate content.",
      title: "Title",
      titlePlaceholder: "Short title for the voice over result",
      manualScript: "Manual Video Script",
      manualScriptPlaceholder: "Write the final voice over script to use directly for audio and render",
      manualScriptHint: "This mode skips automatic visual analysis and uses your script as the primary source.",
      description: "Brief / Description",
      descriptionPlaceholder: "Write the main direction, promo angle, or narration you want",
      contentCategory: "Content Category",
      socialPlatform: "Target Platform",
      subtitleMode: "Video Subtitles",
      subtitleModeHint: "Choose whether the final MP4 should include burned-in subtitles.",
      voiceGender: "Voice Gender",
      tone: "Tone",
      optionalCta: "Optional CTA",
      optionalCtaPlaceholder: "Example: check the details now",
      optionalReference: "Optional Reference Link",
      actionNoteUnlimited: "This account can process videos without deducting balance.",
      actionNoteMetered: (amount) => `${amount} per process. History is available in the History tab.`,
      processVideo: "Process Video",
      summary: "Summary",
      workflowStatus: "Workflow Status",
      activeStep: "Active step",
      visualClips: "Visual clips",
      automatic: "Automatic",
      finalization: "Finalization",
      costBalance: "Cost & Balance",
      sessionCost: "This session cost",
      remainingBalance: "Remaining balance",
      unlimitedBalance: "Unlimited Balance",
      balanceStatus: "Balance status",
      balanceReady: "Ready to process",
      needTopup: "Top up required",
      unlimitedLead: "This account can generate without balance deductions.",
      flatGeneratePrice: (amount) => `Flat price per generate: ${amount}.`,
      aiSession: "AI Session",
      pipelineStatus: "Status",
      voice: "Voice",
      defaultVoice: "Default",
      sourceScript: "Script source",
      analyzedClips: "Visual clips analyzed",
      targetPlatform: "Target platform",
      captionPrefix: "Caption",
      finalReadyTitle: "Final video ready",
      finalReadyLead: (sizeMb) => `The MP4 file has been assembled on this device. Current size: ${sizeMb}.`,
      downloadFinal: "Download Final MP4",
      openHistoryShort: "Open History",
      validateTopup: "Your balance is not enough. Top up before starting a generate.",
      validateFile: "A video file is required.",
      validateDurationPending: "The video duration is still being read. Please wait a moment and try again.",
      validateDurationInvalid: "The video duration is not valid. Maximum 60 seconds.",
      validateFormManual: "The form is incomplete. Make sure the video, title, manual script, category, platform, gender, and tone are ready.",
      validateFormAuto: "The form is incomplete. Make sure the video, title, brief, category, platform, gender, and tone are ready.",
      durationTooLong: "The video duration exceeds the 60 second limit. Choose a shorter video.",
      durationUnreadable: "The video duration could not be read.",
      preparingManual: "Preparing manual script",
      analyzingVideo: "Analyzing video",
      generatingManual: "Preparing caption and voice plan",
      generatingAuto: "Preparing script, caption, and voice plan",
      fetchingAudio: "Fetching main audio",
      rendering: "Assembling final file",
      renderingProgress: "Assembling final file",
      localDraftFound: "A final draft for this session was found. You can download it again or rebuild it.",
      localDraftMissing: "A local draft for this session was found. You can continue finalizing without generating again.",
      localSessionOnly: "The AI session is stored, but local media is not available on this device.",
      downloadAgain: "You can download it again or rebuild it."
    },
    jobs: {
      loadingTitle: "Session History",
      loadingLead: "Loading session history...",
      eyebrow: "Session History",
      title: "Generate History",
      lead: "Review AI results, process status, and continue a session from the same device.",
      refresh: "Refresh",
      listTitle: "Session List",
      items: (count) => `${count} item${count === 1 ? "" : "s"}`,
      cachedDraft: "Local draft available",
      noCache: "No local cache",
      empty: "No saved sessions yet.",
      selectPrompt: "Select a session to view the details.",
      detailEyebrow: "Session Details",
      detailTitle: "Generate Details",
      detailLead: "The final video is stored on the same device, not on a central server.",
      manualScript: "Manual script",
      subtitleMode: "Subtitles",
      clips: (count) => `${count} clips`,
      localDraftAvailable: "This device still stores the local draft for this session.",
      localDraftUnavailable: "There is no local cache on this device. You can still review AI output, but you cannot render again without uploading the video again.",
      mode: "Mode",
      category: "Category",
      platform: "Platform",
      voiceGender: "Voice Gender",
      tone: "Tone",
      videoDuration: "Video Duration",
      cost: "Cost",
      brief: "Brief",
      cta: "CTA",
      reference: "Reference Link",
      scriptTitle: "Voice Over Script",
      captionTitle: "Social Caption",
      finalized: "Finalization",
      completed: "Completed",
      notYet: "Not available",
      fileSize: "File Size",
      finalDuration: "Final Duration",
      openWorkspace: "Open in Generate Workspace",
      continueFinalize: "Continue Finalizing",
      localDraftNeeded: "Local Draft Required",
      finalUnavailable: "Final Not Ready",
      downloadFinal: "Download Final"
    }
  }
};

export function getUserCopy(locale: ContentLanguage): UserCopy {
  return USER_COPY[locale];
}
