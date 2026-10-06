'use strict';
/* DELF50 · corpus-v200 · Day 3
 *
 * 为什么需要这一批：Day 3 此前由 v187 的 makeGeneric() 生成，产出的不是法语文本，
 * 而是一副骨架：`${nom} doit prendre une décision dans une situation liée à ${topic}`
 * 里 topic 是原始主题键，渲染成 « liée à service »（缺冠词，应为 au service）；
 * `Le premier élément concerne ${a}; le deuxième porte sur ${b}` 里 a/b 是原始词表项，
 * 渲染成 « concerne rendez-vous; le deuxième porte sur disponible »。第三段是所有
 * Day 3 材料共用的固定说明。三道题里有两道问的是课程本身（「今天用 « négation et
 * pouvoir / vouloir / devoir » 强化了哪项能力？」），不是阅读理解。
 *
 * 这些槽位一律装载下面逐篇撰写的材料，与是否作答无关（见 v200 头部说明）。
 *
 * 课程对齐（v17 Day 3）：语法 = 否定式 + pouvoir / vouloir / devoir；
 * 主题 = 服务场景与礼貌请求；等级 A2。每篇都在真实语境里反复出现当日语法点：
 * ne…pas / ne…plus / ne…rien / ne…jamais，以及三个情态动词的现在时。
 *
 * 撰写约定同 corpus-v200.js：正确项写在第 0 位，装载时按内容哈希洗牌；
 * 解析不得引用选项位置。同一天阅读与听力的 domain 互不重复。
 */
var FEI3 = {label:'France Éducation international · exemples de sujets DELF (A2 / B1)', url:'https://www.france-education-international.fr/diplome/delf-tout-public/niveau-b1/exemples-sujets'};
var SP3  = {label:'Service-Public.fr · DILA (Licence Ouverte 2.0)', url:'https://www.service-public.fr'};
var AME3 = {label:'Assurance Maladie · ameli.fr (Licence Ouverte 2.0)', url:'https://www.ameli.fr'};

globalThis.__DELF50_CORPUS_V200 = (globalThis.__DELF50_CORPUS_V200 || []).concat([

/* ---------------------------- Day 3 · 阅读 ---------------------------- */
{t:'r',d:3,s:1,genre:'message de confirmation',domain:'rendez-vous médical',level:'A2',src:AME3,
 title:'Confirmation de votre rendez-vous',
 text:"<b>Cabinet du docteur Lemaire — confirmation</b><br><br>Bonjour Madame Roux,<br><br>Votre rendez-vous est fixé au jeudi 12 mars à 15 h 40. Vous devez arriver dix minutes avant et apporter votre carte Vitale.<br><br>Attention : le cabinet ne fait plus les analyses de sang sur place. Il faut passer au laboratoire du 4, rue Pasteur.<br><br>Si vous ne pouvez pas venir, vous pouvez annuler jusqu'à la veille à midi. Après cette heure, la consultation reste due.<br><br>Nous ne prenons pas les chèques.",
 qs:[
  ["Que doit faire Madame Roux le jour du rendez-vous ?",
   ["Arriver dix minutes en avance avec sa carte Vitale.","Passer d'abord au laboratoire de la rue Pasteur.","Apporter un chèque pour régler la consultation."],0,
   "« Vous devez arriver dix minutes avant et apporter votre carte Vitale » 是唯一的到场要求。实验室是抽血才去，支票明确不收。"],
  ["Qu'est-ce que le cabinet ne fait plus ?",
   ["Les analyses de sang.","Les consultations le jeudi.","Les rendez-vous l'après-midi."],0,
   "« ne fait plus » 直接对应停办的项目；周四 15 h 40 恰恰就是本次预约的时间。"],
  ["Jusqu'à quel moment peut-on annuler sans payer ?",
   ["Jusqu'au mercredi à midi.","Jusqu'au jeudi à 15 h 40.","On ne peut pas annuler."],0,
   "la veille 指预约日的前一天：预约在 jeudi，前一天即 mercredi。这一题考的是 veille 的推算。"]]},

{t:'r',d:3,s:2,genre:'note d’information',domain:'inscription en médiathèque',level:'A2',src:SP3,
 title:'S’inscrire à la médiathèque Jean-Moulin',
 text:"<b>MÉDIATHÈQUE JEAN-MOULIN — INSCRIPTION</b><br><br>L'inscription est gratuite pour les habitants de la commune. Vous devez présenter une pièce d'identité et un justificatif de domicile de moins de trois mois. Une facture de téléphone portable n'est pas acceptée.<br><br>Les personnes qui n'habitent pas la commune peuvent s'inscrire, mais elles doivent payer dix-huit euros par an.<br><br>La carte est remise tout de suite : vous ne devez pas revenir un autre jour.<br><br>Les enfants de moins de quatorze ans ne peuvent pas s'inscrire seuls.",
 qs:[
  ["Quel document ne peut pas servir de justificatif de domicile ?",
   ["Une facture de téléphone portable.","Une facture d'électricité récente.","Une quittance de loyer du mois dernier."],0,
   "文中唯一被排除的是 facture de téléphone portable；另外两项都满足「三个月以内的居住证明」。"],
  ["Que doit faire une personne qui habite dans une autre commune ?",
   ["Payer dix-huit euros par an.","Fournir deux pièces d'identité.","Revenir chercher sa carte un autre jour."],0,
   "« mais elles doivent payer » 是对非本地居民的唯一附加条件。"],
  ["Quand reçoit-on sa carte ?",
   ["Le jour même de l'inscription.","Trois mois après la demande.","Lors d'un second rendez-vous."],0,
   "« La carte est remise tout de suite » 与 « vous ne devez pas revenir un autre jour » 互相印证；trois mois 说的是证明文件的有效期。"]]},

{t:'r',d:3,s:3,genre:'avis en boutique',domain:'pressing et retrait de commande',level:'A2',src:FEI3,
 title:'Information à notre clientèle',
 text:"<b>PRESSING DU CENTRE</b><br><br>À partir du 2 avril, nous n'ouvrons plus le lundi matin.<br><br>Vous pouvez déposer et retirer vos vêtements du lundi au vendredi de 14 h à 19 h, et le samedi de 9 h à 18 h.<br><br>Les commandes doivent être retirées dans les trente jours. Nous ne gardons pas les vêtements plus longtemps.<br><br>Si vous ne trouvez pas votre ticket, vous devez présenter une pièce d'identité : nous ne rendons rien sans vérification.",
 qs:[
  ["Qu'est-ce qui change à partir du 2 avril ?",
   ["Le pressing est fermé le lundi matin.","Le pressing est fermé toute la journée du lundi.","Le pressing n'ouvre plus le samedi."],0,
   "« nous n'ouvrons plus le lundi matin » —— 周一下午 14 h–19 h 仍然营业，周六照常。"],
  ["Que se passe-t-il au bout de trente jours ?",
   ["Les vêtements ne sont plus conservés.","Le prix du nettoyage augmente.","Il faut présenter une pièce d'identité."],0,
   "« Nous ne gardons pas les vêtements plus longtemps »；身份证件是丢失取件单时的要求，与期限无关。"],
  ["Que faire si l'on a perdu son ticket ?",
   ["Présenter une pièce d'identité.","Revenir un lundi matin.","Rien : le pressing rend les vêtements sans vérification."],0,
   "« nous ne rendons rien sans vérification » 是明确的否定，排除第三种做法。"]]},

{t:'r',d:3,s:4,genre:'courriel administratif',domain:'état civil',level:'A2',src:SP3,
 title:'Votre demande d’acte de naissance',
 text:"<b>Objet : votre demande d'acte de naissance</b><br><br>Madame, Monsieur,<br><br>Nous avons bien reçu votre demande du 8 janvier. Nous ne pouvons pas la traiter en l'état : le formulaire n'est pas signé.<br><br>Vous devez nous le renvoyer signé, par courrier ou en le déposant à l'accueil. Nous n'acceptons pas les documents envoyés par courriel.<br><br>Dès réception, le délai de traitement est de cinq jours ouvrés.<br><br>Vous ne devez pas refaire toute la demande : seule la signature manque.<br><br>Cordialement,<br>Service de l'état civil",
 qs:[
  ["Pourquoi la demande n'est-elle pas traitée ?",
   ["Le formulaire n'a pas été signé.","La demande est arrivée trop tard.","Un justificatif de domicile manque."],0,
   "« le formulaire n'est pas signé » 是信中给出的唯一原因。"],
  ["Comment faut-il renvoyer le formulaire ?",
   ["Par courrier ou en le déposant à l'accueil.","Par courriel uniquement.","En se présentant obligatoirement au guichet."],0,
   "文中给出两种方式；courriel 被明确排除；« obligatoirement » 与「或寄信」矛盾。"],
  ["Qu'est-ce qui n'est pas nécessaire ?",
   ["Recommencer la demande depuis le début.","Signer le formulaire.","Attendre cinq jours ouvrés après réception."],0,
   "« Vous ne devez pas refaire toute la demande » —— 注意 ne pas devoir 表示「不必」，而不是「不准」。"]]},

/* ---------------------------- Day 3 · 听力 ---------------------------- */
{t:'l',d:3,s:1,genre:'message vocal professionnel',domain:'assurance automobile',level:'A2',src:FEI3,
 title:'Un constat incomplet',
 script:"Bonjour, ici Sylvie Marchand, de l'agence Assurances Delaunay. Je vous appelle au sujet de votre constat du 3 février. Nous ne pouvons pas ouvrir le dossier : il manque le nom de l'autre conducteur. Vous pouvez me rappeler au 02 40 55 18 07, ou passer à l'agence, qui est ouverte jusqu'à dix-sept heures. N'envoyez pas le constat par courriel : nous ne le recevons pas correctement. Je ne travaille pas le mercredi ; ce jour-là, demandez monsieur Fabre. Bonne journée.",
 qs:[
  ["Pourquoi le dossier ne peut-il pas être ouvert ?",
   ["Le nom de l'autre conducteur manque.","Le constat n'a pas été signé.","Le constat est arrivé trop tard."],0,
   "« il manque le nom de l'autre conducteur » 是唯一给出的原因。"],
  ["Qu'est-ce qu'il ne faut pas faire ?",
   ["Envoyer le constat par courriel.","Passer à l'agence avant dix-sept heures.","Téléphoner au numéro indiqué."],0,
   "« N'envoyez pas … par courriel » 是唯一的禁止；另外两项恰恰是她建议的做法。"],
  ["Que faire si l'on appelle un mercredi ?",
   ["Demander monsieur Fabre.","Rappeler le lendemain.","Laisser un message à Sylvie Marchand."],0,
   "« Je ne travaille pas le mercredi ; ce jour-là, demandez monsieur Fabre » 给出了替代联系人。"]]},

{t:'l',d:3,s:2,genre:'dialogue au guichet',domain:'cantine scolaire',level:'A2',src:SP3,
 title:'Inscrire sa fille à la cantine',
 script:"— Bonjour, je voudrais inscrire ma fille à la cantine.\n— Bien sûr. Vous devez remplir ce formulaire et joindre votre avis d'imposition.\n— Je ne l'ai pas avec moi. Je peux l'envoyer plus tard ?\n— Oui, mais l'inscription ne sera pas valable avant. Sans ce document, nous ne pouvons pas calculer le tarif.\n— Et si je veux changer de jours en cours d'année ?\n— C'est possible, mais vous devez prévenir avant le 20 du mois. Après, le changement ne prend effet que le mois suivant.",
 qs:[
  ["Que faut-il joindre au formulaire ?",
   ["L'avis d'imposition.","Une pièce d'identité de l'enfant.","Un justificatif de domicile."],0,
   "« joindre votre avis d'imposition » 是唯一要求的附件。"],
  ["À quoi sert ce document ?",
   ["À calculer le tarif.","À prouver l'adresse de la famille.","À remplacer le formulaire."],0,
   "« sans ce document, nous ne pouvons pas calculer le tarif » 说明了用途。"],
  ["Que se passe-t-il si l'on prévient après le 20 du mois ?",
   ["Le changement s'applique le mois suivant.","Le changement est refusé.","Il faut payer un supplément."],0,
   "« le changement ne prend effet que le mois suivant » —— ne … que 表示「仅仅」，不是拒绝。"]]},

{t:'l',d:3,s:3,genre:'annonce sur haut-parleur',domain:'piscine et salle de sport',level:'A2',src:FEI3,
 title:'Travaux au bassin',
 script:"Mesdames et messieurs, votre attention s'il vous plaît. En raison de travaux, le bassin ne sera pas accessible du 10 au 14 mars. La salle de musculation et les cours collectifs ne sont pas concernés : ils ont lieu normalement. Les abonnés qui le souhaitent peuvent suspendre leur abonnement pendant cette semaine ; il faut le demander à l'accueil avant le 8 mars. Nous ne prolongeons pas automatiquement les abonnements. Merci de votre compréhension.",
 qs:[
  ["Qu'est-ce qui est fermé du 10 au 14 mars ?",
   ["Le bassin seulement.","La salle de musculation.","L'ensemble de l'établissement."],0,
   "« le bassin ne sera pas accessible »，而健身房与团课 « ne sont pas concernés »。"],
  ["Que doivent faire les abonnés pour suspendre leur abonnement ?",
   ["Le demander à l'accueil avant le 8 mars.","Attendre la fin des travaux.","Ne rien faire : c'est automatique."],0,
   "« Nous ne prolongeons pas automatiquement » 明确排除了自动处理。"],
  ["Qu'advient-il des cours collectifs ?",
   ["Ils sont maintenus.","Ils sont annulés.","Ils sont déplacés au bassin."],0,
   "« ils ont lieu normalement » 是直接说明。"]]},

{t:'l',d:3,s:4,genre:'dialogue téléphonique',domain:'dépannage internet',level:'A2',src:FEI3,
 title:'La connexion ne marche plus',
 script:"— Service technique, bonjour.\n— Bonjour, ma connexion ne marche plus depuis hier soir.\n— Est-ce que les voyants de votre box sont allumés ?\n— Le voyant rouge clignote, les autres non.\n— D'accord. Vous devez débrancher la box, attendre trente secondes, puis la rebrancher. Si le voyant reste rouge, nous devons envoyer un technicien.\n— Je ne peux pas être là en journée.\n— Ce n'est pas un problème : nous proposons aussi des rendez-vous le samedi matin. En revanche, nous ne pouvons pas venir le soir.",
 qs:[
  ["Que doit faire le client en premier ?",
   ["Débrancher puis rebrancher sa box.","Attendre la visite d'un technicien.","Changer de box."],0,
   "技术员上门是 « si le voyant reste rouge » 之后的第二步，不是第一步。"],
  ["Dans quel cas un technicien se déplace-t-il ?",
   ["Si le voyant rouge reste allumé après la manipulation.","Si tous les voyants s'éteignent.","Si la panne dure plus d'une semaine."],0,
   "« Si le voyant reste rouge, nous devons envoyer un technicien » 是唯一的条件。"],
  ["Quel rendez-vous est possible pour ce client ?",
   ["Le samedi matin.","En soirée, en semaine.","N'importe quel jour en journée."],0,
   "他白天不在（ne peux pas être là en journée），而 « nous ne pouvons pas venir le soir » 排除了晚上。"]]}

]);
