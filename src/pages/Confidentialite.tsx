import { Link } from 'react-router-dom';
import ThemeSwitch from '../components/ThemeSwitch';
import '../aurora/aurora.css';

// Politique de confidentialité (RGPD). Version alignée avec HEALTH_CONSENT_VERSION
// (api/endpoints.ts) : toute évolution substantielle du traitement doit incrémenter
// les DEUX (la version du consentement santé recueilli référence cette politique).
const POLICY_VERSION = 'v2';
const LAST_UPDATED = '25 octobre 2026';

export default function Confidentialite() {
  return (
    <div className="aurora-root rost-auth" style={{ alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="rost-auth-theme"><ThemeSwitch floating /></div>

      <article
        className="rost-auth-card"
        style={{ maxWidth: 760, width: '100%', textAlign: 'left', margin: '48px auto' }}
      >
        <h1 className="rost-auth-title">Politique de confidentialité</h1>
        <p className="rost-auth-sub">Version {POLICY_VERSION} — dernière mise à jour : {LAST_UPDATED}</p>

        <section style={{ marginTop: 24, lineHeight: 1.6 }}>
          <p>
            La présente politique décrit comment Rost.r traite vos données personnelles,
            conformément au Règlement (UE) 2016/679 (RGPD). Rost.r ne collecte <strong>aucune
            donnée médicale</strong> ; votre objectif et vos cibles nutritionnelles, susceptibles de
            révéler des informations liées à la santé (article 9), sont traités avec votre consentement.
          </p>

          <h2>1. Responsable du traitement</h2>
          <p>
            {/* À compléter par l'exploitant / le DPO avant mise en production. */}
            <em>[À compléter : identité et coordonnées du responsable de traitement, et le cas
            échéant du délégué à la protection des données (DPO).]</em>
          </p>

          <h2>2. Données que nous traitons</h2>
          <ul>
            <li><strong>Identité &amp; compte</strong> : email, mot de passe (haché), comptes liés
              (OAuth), rôles. <em>Base légale : exécution du contrat (art. 6.1.b).</em></li>
            <li><strong>Profil nutritionnel (art. 9)</strong> : objectif (perte de poids, maintien…),
              régime, préférences de repas et de cuisine, aliments exclus (allergènes compris, sans
              motif ni gravité) et cibles journalières (calories, macronutriments).
              <em> Base légale : votre consentement explicite (art. 9.2.a).</em></li>
            <li><strong>Données physiques — sur votre appareil uniquement</strong> : date de naissance,
              sexe, taille, poids et volume d’activité sont enregistrés dans votre navigateur et ne
              nous sont <strong>jamais transmis</strong>. Les cibles en sont déduites localement ;
              seul ce résultat est envoyé.</li>
            <li><strong>Menus &amp; nutrition</strong> : menus générés à partir de votre profil,
              préférences, listes de courses. <em>Base légale : exécution du contrat (art. 6.1.b).</em></li>
            <li><strong>Notifications</strong> : messages et abonnements aux notifications.
              <em> Base légale : consentement / contrat (art. 6.1.a / 6.1.b).</em></li>
            <li><strong>Sécurité &amp; journaux</strong> : historique de mots de passe, jetons
              d’authentification, journaux d’audit. <em>Base légale : intérêt légitime / obligation
              légale (art. 6.1.f / 6.1.c).</em></li>
          </ul>

          <h2>3. Consentement</h2>
          <p>
            L’enregistrement de votre profil nutritionnel repose sur votre <strong>consentement explicite</strong>.
            Vous pouvez le donner ou le retirer à tout moment depuis votre espace
            <em> Profil → Confidentialité</em>. Sans consentement actif, vous ne pouvez pas modifier
            votre profil nutritionnel ; les données déjà enregistrées restent accessibles,
            exportables et supprimables. Le retrait du consentement n’a pas d’effet rétroactif sur
            les traitements déjà réalisés.
          </p>

          <h2>4. Durées de conservation</h2>
          <ul>
            <li><strong>Profil nutritionnel</strong> : tant que le compte est actif ;
              suppression à la fermeture du compte, ou après <strong>24 mois d’inactivité</strong>.</li>
            <li><strong>Menus</strong> : tant que le compte est actif ; rotation au-delà de 12 mois.</li>
            <li><strong>Notifications</strong> : <strong>12 mois</strong>.</li>
            <li><strong>Journaux d’audit</strong> : <strong>3 ans</strong> (preuve et sécurité).</li>
            <li><strong>Jetons &amp; codes temporaires</strong> : purgés dès leur expiration.</li>
            <li><strong>Données physiques</strong> : conservées par votre navigateur ; vous les
              effacez en vidant les données du site.</li>
            <li><strong>Invitations expirées/révoquées</strong> : 90 jours.</li>
          </ul>

          <h2>5. Vos droits</h2>
          <p>Vous disposez à tout moment des droits suivants, exerçables depuis
            <em> Profil → Confidentialité</em> ou en nous contactant :</p>
          <ul>
            <li><strong>Accès et portabilité</strong> (art. 15 et 20) : télécharger l’ensemble de
              vos données dans un fichier JSON.</li>
            <li><strong>Rectification</strong> (art. 16) : corriger vos données depuis votre profil.</li>
            <li><strong>Effacement</strong> (art. 17) : supprimer définitivement votre compte ; la
              suppression est propagée à l’ensemble de nos services.</li>
            <li><strong>Retrait du consentement</strong> (art. 7) à tout moment, sans affecter la
              licéité des traitements antérieurs.</li>
          </ul>

          <h2>6. Cookies &amp; traceurs</h2>
          <p>
            Nous n’utilisons <strong>aucun traceur publicitaire ni outil de mesure d’audience tiers</strong>.
            Seul un cookie strictement nécessaire au fonctionnement (cookie de session sécurisé,
            <em> HttpOnly</em>) est utilisé pour vous maintenir connecté ; il est exempté de
            consentement au titre des recommandations de la CNIL.
          </p>

          <h2>7. Sécurité</h2>
          <p>
            Les mots de passe sont hachés (Argon2) et les jetons sensibles chiffrés. Les accès sont
            journalisés et les journaux expurgés des données sensibles.
          </p>

          <h2>8. Réclamation</h2>
          <p>
            Vous pouvez introduire une réclamation auprès de la CNIL (
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>)
            si vous estimez que le traitement de vos données n’est pas conforme.
          </p>
        </section>

        <div className="rost-auth-links" style={{ marginTop: 28 }}>
          <Link to="/login">← Retour</Link>
        </div>
      </article>
    </div>
  );
}
