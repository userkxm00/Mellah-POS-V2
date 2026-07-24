import { create } from 'zustand'

export type Language = 'ar' | 'fr'

const frDictionary: Record<string, string> = {
  // Navigation & Core App Headers
  'MELLAH POS': 'MELLAH POS',
  'الفرع الرئيسي': 'Succursale Principale',
  'أونلاين (متزامن)': 'En ligne (Synchronisé)',
  'أوفلاين (محلي)': 'Hors ligne (Local)',
  'إعادة الاتصال': 'Se reconnecter',
  'جاري الفحص...': 'Vérification...',
  'مدير النظام': 'Administrateur',
  'مشرف المتجر': 'Superviseur',
  'كاشير': 'Caissier',
  'خروج': 'Déconnexion',
  'لوحة التحكم والتشغيل المركزية': 'Tableau de Bord Principal',
  'مرحباً بك،': 'Bienvenue,',
  'اختر الوحدة المطلوبة للبدء. نظام نقاط البيع يعمل بمرونة وسرعة تامة.': 'Sélectionnez un module pour commencer. Le système fonctionne en toute sécurité.',
  'الفرع النشط': 'Magasin Actif',
  'وضع التشغيل': 'Mode de Fonctionnement',
  'محلي فائق السرعة + متزامن': 'Local Ultra Rapide + Synchro',
  'صلاحياتك الحالية': 'Vos Autorisations',
  'وحدات النظام المتوفرة': 'Modules Disponibles',
  'متاحة حسب صلاحياتك': 'disponibles selon vos droits',
  'إغلاق النافذة': 'Fermer la fenêtre',
  'نافذة جديدة': 'Nouvelle fenêtre',
  'شاشة رئيسية': 'Écran principal',

  // Launcher Tiles
  'نقطة البيع (POS)': 'Caisse (POS)',
  'واجهة الكاشير البيع الفوري السريع': 'Interface de Vente Rapide',
  'سجل المبيعات': 'Historique des Ventes',
  'استعراض الفواتير وإعادة الطباعة': 'Consulter les factures et réimprimer',
  'إدارة المرتجعات': 'Gestion des Retours',
  'استرجاع المنتجات والتعويضات': 'Retours de produits et avoirs',
  'الزبائن والولاء': 'Clients & Fidélité',
  'قاعدة الزبائن ونقاط المكافآت': 'Base clients et points de fidélité',
  'طباعة الملصقات': 'Imprimer des Étiquettes',
  'تيكيتات الباركود 40mm×30mm': 'Étiquettes Code-barres 40x30mm',
  'المنتجات والمخزون': 'Produits & Stock',
  'إضافة السلع والمقاسات والألوان': 'Gestion des produits, tailles & couleurs',
  'التقارير والتحليلات': 'Rapports & Analyses',
  'مؤشرات الأرباح والمبيعات الحية': 'Statistiques de ventes et bénéfices',
  'إدارة المستخدمين': 'Gestion des Utilisateurs',
  'إضافة وحذف وتعيين أدوار الطاقم': 'Gestion du personnel et privilèges',
  'إدارة الفروع': 'Gestion des Succursales',
  'الفروع والمحلات التابعة للمتجر': 'Points de vente et magasins',
  'إعدادات المتجر': 'Paramètres du Magasin',
  'بيانات الفاتورة والنسخ الاحتياطي': 'Informations du ticket et sauvegarde',
  'سجل العمليات (Audit)': 'Journal d\'Audit',
  'استعراض سجل التدقيق والأمان': 'Historique des actions et sécurité',
  'الصيانة والتحديثات': 'Maintenance & Mises à jour',
  'فحص وإصلاح النظام وتحديث التطبيق': 'Vérification, réparation et mises à jour',
  'أدوات الفحص والإصلاح وتحديث النظام': 'Outils d\'inspection, de réparation et mise à jour',
  'صيانة شاملة': 'Maintenance Complète',
  'جاري الصيانة الشاملة...': 'Maintenance en cours...',
  'إصدار التطبيق': 'Version de l\'application',
  'حجم قاعدة البيانات': 'Taille de la base de données',
  'حالة النظام': 'État du système',
  'يعمل بشكل طبيعي': 'Fonctionne normalement',
  'أدوات الصيانة والإصلاح': 'Outils de maintenance et réparation',
  'فحص سلامة قاعدة البيانات': 'Vérification d\'intégrité de la base',
  'يتحقق من عدم وجود تلف أو بيانات معطوبة في قاعدة البيانات المحلية.': 'Vérifie l\'absence de corruption dans la base de données locale.',
  'ضغط وتحسين قاعدة البيانات': 'Compacter et optimiser la base',
  'يُعيد تنظيم ملف القاعدة ويحرر المساحة غير المستخدمة لتسريع الأداء.': 'Réorganise le fichier et libère l\'espace inutilisé.',
  'تنظيف الملفات المؤقتة والكاش': 'Nettoyer le cache et fichiers temporaires',
  'يحذف ملفات الكاش المؤقتة التي قد تسبب بطء أو مشاكل في العرض.': 'Supprime les fichiers temporaires pouvant ralentir l\'affichage.',
  'تشغيل': 'Exécuter',
  'التحديثات': 'Mises à jour',
  'فحص التحديثات': 'Vérifier les mises à jour',
  'تحديث جديد متوفر': 'Nouvelle mise à jour disponible',
  'يتوفر إصدار جديد من Mellah POS. حمّله الآن لتحسين الأداء والأمان.': 'Une nouvelle version de Mellah POS est disponible.',
  'جاري تحميل التحديث...': 'Téléchargement de la mise à jour...',
  'التحديث جاهز للتثبيت': 'Mise à jour prête à être installée',
  'اضغط على الزر لإعادة التشغيل وتثبيت التحديث.': 'Cliquez pour redémarrer et installer la mise à jour.',
  'تحميل التحديث': 'Télécharger la mise à jour',
  'إعادة التشغيل والتثبيت': 'Redémarrer et Installer',
  'أنت تستخدم أحدث إصدار ✅': 'Vous utilisez la dernière version ✅',
  'تمت الصيانة الشاملة بنجاح ✅': 'Maintenance complète réussie ✅',
  'انتهت الصيانة مع بعض التحذيرات ⚠️': 'Maintenance terminée avec des avertissements ⚠️',

  // POS Checkout Page
  'مبلغ الباقي للزبون': 'Rendu Monnaie Client',
  'مبلغ الباقي للزبون:': 'Rendu Monnaie Client:',
  'تعليق الفاتورة (F2)': 'Mettre en Attente (F2)',
  'السلال المعلقة': 'Ventes en Attente',
  'فتح درج النقد': 'Ouvrir Tiroir-Caisse',
  'بحث باسم المنتج أو الباركود...': 'Rechercher produit ou code-barres...',
  'السلة الحالية': 'Panier Actuel',
  'تفاصيل الدفع': 'Détails du Paiement',
  'نقداً (كاش)': 'Espèces (Cash)',
  'بطاقة CIB': 'Carte CIB',
  'دفع مختلط (كاش + CIB)': 'Paiement Mixte',
  'رصيد المتجر': 'Avoir Magasin',
  'استبدال نقاط الولاء': 'Échanger Points de Fidélité',
  'تحديد الزبون': 'Sélectionner un Client',
  'زبون عادي (افتراضي)': 'Client Standard',
  'إضافة زبون جديد': 'Nouveau Client',
  'إتمام عملية البيع (Enter)': 'Valider la Vente (Enter)',
  'جاري معالجة البيع...': 'Traitement de la vente...',
  'الخصم (دج):': 'Remise (DZD):',
  'المجموع الفرعي:': 'Sous-total:',
  'المبلغ النهائي:': 'Montant Total:',
  'المبلغ المدفوع كاش:': 'Montant Espèces:',
  'السلة فارغة حالياً': 'Le panier est actuellement vide',
  'أضف منتجات من القائمة أو امسح الباركود للبدء': 'Ajoutez des produits de la liste ou scannez un code-barres',
  'حاسبة الباقي': 'Calculateur de Monnaie',
  'المبلغ النقدي المدفوع من الزبون:': 'Espèces reçues du client:',
  'الباقي المستحق للزبون:': 'Monnaie à rendre au client:',
  'تأكيد الدفع وإتمام البيع': 'Valider le paiement',
  'إلغاء': 'Annuler',

  // Products & Inventory Page
  'إضافة منتج جديد': 'Ajouter un Produit',
  'إدارة المنتجات والمخزون': 'Gestion des Produits et du Stock',
  'استيراد CSV': 'Importer CSV',
  'تعديل الأسعار جماعياً': 'Modification Prix en Masse',
  'تصدير CSV': 'Exporter CSV',
  'طلب تزود (PO)': 'Bon de Commande (PO)',
  'الفئات': 'Catégories',
  'جميع الفئات': 'Toutes les Catégories',
  'المنخفض فقط': 'Stock Bas Uniquement',
  'ابحث باسم المنتج أو الفئة...': 'Rechercher par nom ou catégorie...',
  'المنتج': 'Produit',
  'السعر الافتراضي': 'Prix Par Défaut',
  'عدد الخيارات': 'Nombre de Variantes',
  'إجمالي المخزون (Ledger)': 'Stock Total (Ledger)',
  'الإجراءات': 'Actions',
  'التفاصيل والجرد': 'Détails & Stock',
  'لا توجد منتجات مسجلة طابق البحث': 'Aucun produit ne correspond à la recherche',
  'التعديل الجماعي لأسعار البيع (Bulk Price Update)': 'Modification de Prix en Masse',
  'اختر الفئة المستهدفة:': 'Sélectionner la catégorie ciblée:',
  'نوع التعديل:': 'Type de modification:',
  'نسبة مئوية (%)': 'Pourcentage (%)',
  'مبلغ ثابت (دج DZD)': 'Montant Fixe (DZD)',
  'قيمة التعديل (+ للزيادة، - للتخفيض):': 'Valeur (+ augmentation, - réduction):',
  'تأكيد وتطبيق التعديل الجماعي': 'Confirmer et appliquer',
  'جميع الفئات والمنتجات': 'Toutes les catégories et produits',

  // Product Detail Page
  'تفاصيل المنتج والجرد': 'Détails du Produit et Stock',
  'تعديل بيانات المنتج': 'Modifier le Produit',
  'حذف المنتج': 'Supprimer le Produit',
  'إضافة خيار جديد (مقاس/لون)': 'Ajouter une Variante (Taille/Couleur)',
  'حركات المخزون (Stock Movement History)': 'Historique des Mouvements de Stock',
  'اسم المنتج:': 'Nom du Produit:',
  'الفئة:': 'Catégorie:',
  'سعر البيع:': 'Prix de Vente:',
  'التكلفة:': 'Coût d\'Achat:',
  'الوصف:': 'Description:',
  'المقاس': 'Taille',
  'اللون': 'Couleur',
  'الباركود': 'Code-barres',
  'رمز SKU': 'Code SKU',
  'المخزون الحالي': 'Stock Actuel',
  'الحد الأدنى للمخزون': 'Stock Minimum',
  'تعديل الستوك': 'Ajuster le Stock',
  'نوع الحركة': 'Type de mouvement',
  'تزويد (Restock)': 'Réapprovisionnement',
  'تعديل (Adjustment)': 'Ajustement',
  'تالف (Damaged)': 'Endommagé',
  'حفظ التعديلات': 'Enregistrer les modifications',
  'قطع': 'pcs',
  'قطعة': 'pcs',
  'قطعة بالمخزون': 'pcs en stock',

  // Sales History Page
  'سجل المبيعات والتنزيلات': 'Historique des Ventes',
  'ابحث برقم الفاتورة أو اسم الكاشير...': 'Rechercher par n° de facture ou caissier...',
  'فلترة بالتواريخ': 'Filtrer par Date',
  'كل الأوقات': 'Tout le temps',
  'اليوم': 'Aujourd\'hui',
  'أمس': 'Hier',
  'آخر 7 أيام': '7 derniers jours',
  'آخر 30 يوم': '30 derniers jours',
  'مخصص': 'Personnalisé',
  'رقم الفاتورة': 'N° Facture',
  'التاريخ والوقت': 'Date & Heure',
  'الكاشير': 'Caissier',
  'الزبون': 'Client',
  'المبلغ الإجمالي': 'Montant Total',
  'طريقة الدفع': 'Mode de Paiement',
  'الحالة': 'Statut',
  'مكتملة': 'Complétée',
  'ملغاة (Voided)': 'Annulée (Voided)',
  'مرتجعة': 'Retournée',
  'إعادة طباعة': 'Réimprimer',
  'إلغاء الفاتورة (Void)': 'Annuler la Facture (Void)',
  'تفاصيل الفاتورة': 'Détails de la Facture',

  // Returns Page
  'إدارة المرتجعات واستبدال البضاعة': 'Gestion des Retours Produit',
  'ابحث برقم الوصل أو رقم الفاتورة...': 'Rechercher par n° de ticket ou facture...',
  'تفاصيل الفاتورة الأصلية': 'Détails de la Facture Origine',
  'تحديد المواد المراد إرجاعها': 'Sélectionner les articles à retourner',
  'الكمية المرتجعة': 'Quantité Retournée',
  'سبب الإرجاع': 'Motif du retour',
  'طريقة التعويض': 'Mode de Remboursement',
  'إرجاع نقداً (كاش)': 'Remboursement Espèces',
  'رصيد متجر (Store Credit)': 'Avoir Magasin (Store Credit)',
  'تأكيد تسجيل المرتجع': 'Valider le Retour',
  'طباعة وصل المرتجع': 'Imprimer le Ticket de Retour',

  // Customers Page
  'إدارة الزبائن وعضوية الولاء': 'Gestion des Clients & Fidélité',
  'اسم الزبون': 'Nom du Client',
  'رقم الهاتف': 'Téléphone',
  'نقاط الولاء': 'Points de Fidélité',
  'سجل المشتريات': 'Historique des Achats',
  'تعديل': 'Modifier',
  'حذف': 'Supprimer',
  'تعديل بيانات الزبون': 'Modifier le Client',

  // Reports Page
  'التقارير المالية والتحليلات': 'Rapports Financiers & Analyses',
  'إجمالي المبيعات': 'Ventes Totales',
  'صافي الأرباح': 'Bénéfice Net',
  'تكلفة البضاعة المباعة (COGS)': 'Coût des Marchandises (COGS)',
  'إجمالي الفواتير': 'Total des Factures',
  'هامش الربح': 'Marge Bénéficiaire',
  'أفضل 10 منتجات مبيعاً': 'Top 10 des Produits',
  'توزيع طرق الدفع': 'Répartition des Paiements',
  'سجل الورديات': 'Historique des Caisses',
  'تصدير التقارير': 'Exporter les Rapports',

  // Users & Roles Page
  'إدارة المستخدمين والأدوار': 'Gestion des Utilisateurs',
  'إضافة مستخدم جديد': 'Nouveau Utilisateur',
  'الاسم الكامل': 'Nom Complet',
  'الدور / الصلاحية': 'Rôle / Permissions',
  'رمز PIN (4 أرقام)': 'Code PIN (4 chiffres)',
  'تعديل البيانات': 'Modifier les Infos',
  'تغيير رمز PIN': 'Changer le PIN',
  'حذف المستخدم': 'Supprimer l\'utilisateur',

  // Branches Page
  'إدارة الفروع والمحلات': 'Gestion des Succursales',
  'إضافة فرع جديد': 'Nouvelle Succursale',
  'اسم الفرع': 'Nom de la Succursale',
  'العنوان': 'Adresse',

  // Audit Log Page
  'سجل التغييرات والعمليات (Audit Log Viewer)': 'Journal d\'Audit et Sécurité',
  'ابحث بالاسم، التفاصيل، أو العملية...': 'Rechercher par nom, détails ou action...',
  'المستخدم / المنفذ': 'Utilisateur / Opérateur',
  'نوع العملية (Action)': 'Type d\'Action',
  'القسم / النطاق': 'Domaine',
  'تفاصيل العملية والتغييرات': 'Détails de l\'action',

  // Label Printer Page
  'طباعة بطاقات الأسعار والباركود للملابس (Price Tags)': 'Impression d\'Étiquettes & Codes-barres',
  'اختر المنتج لطباعة تيكيتات مقاساته وألوانه:': 'Sélectionnez un produit pour imprimer ses étiquettes:',
  'طباعة الكل': 'Tout Imprimer',
  'معاينة نموذج البطاقة الحرارية (40mm × 30mm)': 'Aperçu de l\'étiquette thermique (40x30mm)',
  'العدد:': 'Quantité:',

  // Settings Page
  'إعدادات المتجر وطابعة الفواتير واللغة والنسخ الاحتياطي': 'Paramètres du Magasin, Imprimante & Langue',
  'بيانات المتجر والفواتير': 'Information du Magasin & Tickets',
  'اسم المتجر (المطبوع أعلى الفاتورة)': 'Nom du Magasin (en haut du ticket)',
  'عنوان المتجر': 'Adresse du Magasin',
  'هاتف المتجر': 'Téléphone du Magasin',
  'نص أسفل الفاتورة الحرارية (Footer Text)': 'Pied de page du ticket (Footer)',
  'اللغة والأمان': 'Langue & Sécurité',
  'لغة الواجهة (Language)': 'Langue de l\'interface',
  'قفل الجلسة عند التوقف (دقائق)': 'Délai de verrouillage (min)',
  'إعدادات طابعة الفواتير الحرارية (Thermal Printer)': 'Paramètres de l\'imprimante thermique',
  'طابعة الفواتير المتصلة بالكمبيوتر': 'Imprimante connectée au PC',
  'عرض ورق الفواتير الحرارية': 'Largeur du papier thermique',
  'طباعة تجريبية': 'Test d\'impression',
  'طباعة فاتورة تجريبية': 'Imprimer un ticket test',
  'حفظ الإعدادات': 'Enregistrer les paramètres',
  'النسخ الاحتياطي واسترجاع البيانات': 'Sauvegarde & Restauration',
  'تصدير نسخة احتياطية (Backup)': 'Exporter une sauvegarde (Backup)',
  'حفظ ملف JSON محلي يحتوي على كل بيانات المتجر والمبيعات والمنتجات.': 'Télécharger un fichier JSON contenant toutes les données du magasin.',
  'تصدير ملف النسخة الاحتياطية': 'Télécharger la sauvegarde',
  'استرجاع نسخة احتياطية (Restore)': 'Restaurer une sauvegarde (Restore)',
  'حول برنامج Mellah POS': 'À propos de Mellah POS',
  'إصدار النظام:': 'Version du Système:',
  'قاعدة البيانات:': 'Base de Données:',
  'محرك الواجهة:': 'Moteur d\'Interface:',

  // Login Page & Modals
  'تسجيل الدخول للنظام': 'Connexion au Système',
  'رمز PIN الخصي بك (4 أرقام)': 'Code PIN (4 chiffres)',
  'دخول': 'Connexion',
}

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
  t: (keyOrText: string) => string
}

const initialLang = (localStorage.getItem('mellah_lang') as Language) || 'ar'
if (typeof document !== 'undefined') {
  document.documentElement.dir = initialLang === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = initialLang
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: initialLang,

  setLanguage: (language: Language) => {
    localStorage.setItem('mellah_lang', language)
    if (typeof document !== 'undefined') {
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = language
    }
    set({ language })
  },

  t: (keyOrText: string) => {
    const lang = get().language
    if (lang === 'ar') return keyOrText
    const trimmed = keyOrText.trim()
    return frDictionary[trimmed] || frDictionary[keyOrText] || keyOrText
  },
}))
