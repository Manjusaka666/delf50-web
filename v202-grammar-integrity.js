'use strict';
function installGrammarIntegrity202(){
  'use strict';
  const APP='1.9.4', CONTENT='1.9.4', ROUTE='grammar-integrity-history-v1';
  const LATE_IDS=new Set(['passeRecent','plusqueparfait','hypothesis','subjonctif','reported','negationB1','passive','gerondif','ppagreement','prepositionalVerbs','doublePronouns','indefinitePronouns','relativesB1','emphasis','nominalisation','logicalB1','superlative','adverbsB1']);
  const GENERIC_WHY='Une argumentation B1 suit une progression claire.';
  const GENERIC_STEM=/^Pour (?:donner son avis|justifier une opinion|donner un exemple|reconnaître une limite|terminer un point de vue) sur /i;
  const NAMES=['Nora','Amine','Léa','Samir','Élodie','Marc','Inès','Thomas','Sofia','Camille'];
  const CITIES=['Lyon','Nantes','Bordeaux','Lille','Toulouse','Rennes','Grenoble','Tours','Dijon','Strasbourg'];
  const DAYS=['lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const SCENES=['Dans un courriel reçu à','Lors d’un appel depuis','Dans une annonce diffusée à','Pendant une réunion à','Dans un message envoyé depuis','Lors d’un entretien à','Dans une note préparée à'];

  function clone202(x){try{return JSON.parse(JSON.stringify(x))}catch(e){return x}}
  function norm202(x){return String(x==null?'':x).replace(/\s+/g,' ').trim()}
  function qid202(g,q,qi){return q&&q[4]&&q[4].traceId?String(q[4].traceId):`GQ-${g.id}-${String(qi+1).padStart(2,'0')}`}
  function completion202(day,id){const r=S&&S.contentProgress172&&S.contentProgress172.completed&&S.contentProgress172.completed.grammar&&S.contentProgress172.completed.grammar[id];return r&&Number(r.day)===Number(day)?r:null}
  function isGenericFallback202(q){return !!(q&&(norm202(q[3])===GENERIC_WHY||GENERIC_STEM.test(norm202(q[0]))))}
  function generatedOrdinal202(q,qi){const id=q&&q[4]&&q[4].traceId||'',m=String(id).match(/-(\d+)$/);return m?Math.max(0,Number(m[1])-1):Math.max(0,qi)}
  function abc202(i){return String.fromCharCode(65+Number(i||0))}
  function esc202(v){return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  function clarifiedStem202(node,stem){
    const s=norm202(stem);
    const exact={
      'Pour exprimer votre opinion…':'Quelle formule convient pour exprimer clairement votre opinion ?',
      'Pour ajouter un exemple…':'Quelle formule convient pour introduire un exemple précis ?',
      'Pour conclure…':'Quelle formule convient pour conclure clairement votre argumentation ?',
      'Forme correcte :':'Quelle forme grammaticale est correcte ?',
      'Forme de faire :':'Quelle est la forme correcte du gérondif de « faire » ?',
      'Après « si » dans une hypothèse, on écrit :':'Quelle forme est correcte après « si » dans une hypothèse ?',
      'Forme correcte de « avoir » au subjonctif avec nous :':'Quelle est la forme correcte de « avoir » au subjonctif avec « nous » ?',
      'décider →':'Quel nom correspond au verbe « décider » ?',
      'répondre →':'Quel nom correspond au verbe « répondre » ?',
      's’inscrire →':'Quel nom correspond au verbe « s’inscrire » ?'
    };
    if(exact[s])return exact[s];
    if(node==='passive'&&s==='« On vérifie les documents » →')return 'Quelle transformation passive de « On vérifie les documents » est correcte ?';
    if(node==='nominalisation'&&s==='« Le service a annulé la réunion » →')return 'Quelle nominalisation correspond à « Le service a annulé la réunion » ?';
    if(node==='nominalisation'&&s==='« Nous avons confirmé votre réservation » →')return 'Quelle nominalisation correspond à « Nous avons confirmé votre réservation » ?';
    return null;
  }

  function context202(n){return {name:NAMES[n%NAMES.length],city:CITIES[(n*3+2)%CITIES.length],day:DAYS[(n*5+1)%DAYS.length],hour:8+(n%10),num:2+(n%7)}}
  function case202(node,n){
    const c=context202(n),k=n%6;
    const A=(stem,correct,wrong1,wrong2,why)=>({stem,correct,wrong1,wrong2,why});
    const cases={
      passeRecent:[
        ()=>A(`${c.name} vient ___ terminer son dossier à ${c.city}.`,'de','à','pour','Le passé récent se construit avec venir au présent + de + infinitif.'),
        ()=>A(`À ${c.hour} h, ${c.name} venait de quitter le bureau quand son téléphone a sonné. Que situe « venait de quitter » ?`,'Une action terminée juste avant l’appel.','Une habitude répétée pendant des années.','Une action qui aura lieu après l’appel.','Venir à l’imparfait + de + infinitif place une action immédiatement avant un repère passé.'),
        ()=>A(`Quelle phrase signifie que ${c.name} a reçu la réponse il y a quelques instants ?`,`${c.name} vient de recevoir la réponse.`,`${c.name} va recevoir la réponse.`,`${c.name} recevait souvent la réponse.`,'Venir de + infinitif exprime une action tout juste accomplie.'),
        ()=>A(`${c.name} et ses collègues ___ de finir la réunion.`,'viennent','vont','ont','Avec ils/elles, venir au présent donne « viennent », puis de + infinitif.'),
        ()=>A('Dans « Nous venons de réserver », l’action est…','très récente et déjà terminée.','future et seulement envisagée.','une habitude sans limite temporelle.','Le passé récent présente un fait achevé très proche du moment de référence.'),
        ()=>A('Quel contraste est correct ?','Elle vient de partir = elle est partie il y a très peu de temps.','Elle vient de partir = elle partira demain.','Elle vient de partir = elle partait chaque semaine.','Le passé récent se distingue du futur proche et de l’imparfait.')
      ],
      plusqueparfait:[
        ()=>A(`Quand ${c.name} est arrivé(e) à ${c.city}, le train ___.`,'était déjà parti','a déjà parti','partira déjà','Le plus-que-parfait marque un fait accompli avant un autre fait passé.'),
        ()=>A(`${c.name} était rassuré(e), car il/elle ___ la réservation la veille.`,'avait confirmé','a confirmé demain','confirmait après','Avoir à l’imparfait + participe passé forme ici le plus-que-parfait.'),
        ()=>A('Quelle phrase présente clairement deux niveaux du passé ?',`${c.name} avait préparé les documents avant de les envoyer.`,`${c.name} prépare les documents avant demain.`,`${c.name} préparera les documents hier.`,'Le plus-que-parfait sert à exprimer l’antériorité dans le passé.'),
        ()=>A('Avec « elles » et un verbe conjugué avec être, quelle forme convient ?','Elles étaient arrivées.','Elles avaient arrivé.','Elles étaient arriver.','Avec être au plus-que-parfait, le participe passé s’accorde avec le sujet.'),
        ()=>A('Dans « J’avais déjà réservé quand le service a appelé », qu’est-ce qui s’est produit en premier ?','La réservation.','L’appel du service.','Les deux événements sont futurs.','« Avais réservé » est antérieur au passé composé « a appelé ».'),
        ()=>A('Quelle construction forme le plus-que-parfait ?','Auxiliaire à l’imparfait + participe passé.','Auxiliaire au futur + infinitif.','Venir au présent + de + infinitif.','Le plus-que-parfait combine avoir/être à l’imparfait et le participe passé.')
      ],
      hypothesis:[
        ()=>A(`Si ${c.name} a le temps ${c.day}, il/elle ___ le dossier.`,'terminera','terminerait hier','terminait demain','Une condition possible peut suivre si + présent, puis futur simple.'),
        ()=>A(`Si ${c.name} ___ plus près de ${c.city}, il/elle irait au travail à vélo.`,'habitait','habitera','habiterait','Une hypothèse irréelle ou peu probable suit si + imparfait, puis conditionnel.'),
        ()=>A('Quelle phrase est correcte ?','Si nous partions plus tôt, nous éviterions les embouteillages.','Si nous partirions plus tôt, nous éviterions les embouteillages.','Si nous partirons plus tôt, nous éviterions les embouteillages.','Dans cette hypothèse, la proposition avec si reste à l’imparfait.'),
        ()=>A(`« Et si on ___ la réunion à ${c.hour} h ? » exprime une suggestion.`,'déplaçait','déplacerait','déplacera','Et si + imparfait peut servir à proposer une solution.'),
        ()=>A(`Si vous pouvez venir, nous ___ à ${c.hour} h.`,'commencerons','commencerions hier','commencions demain','Si + présent peut introduire une condition réelle suivie du futur.'),
        ()=>A('Après « si » dans « Si j’avais le choix… », quel temps ne convient pas ?','Le conditionnel présent.','L’imparfait.','Le présent dans une condition réelle.','On n’emploie pas le conditionnel dans la proposition introduite par si dans ces schémas de base.')
      ],
      subjonctif:[
        ()=>A(`Il faut que ${c.name} ___ le formulaire avant ${c.day}.`,'remplisse','remplit','remplira','Il faut que exprime la nécessité et appelle le subjonctif.'),
        ()=>A(`Je vous écris pour que vous ___ me répondre avant ${c.hour} h.`,'puissiez','pouvez','pourrez','Pour que exprime le but avec deux sujets et demande le subjonctif.'),
        ()=>A(`${c.name} souhaite que nous ___ une solution plus simple.`,'trouvions','trouverons','trouvons toujours','Souhaiter/vouloir que + proposition exprime la volonté et appelle le subjonctif.'),
        ()=>A(`Bien que le trajet ___ plus long, ${c.name} choisit le train.`,'soit','est','sera','Bien que introduit une concession et se construit avec le subjonctif.'),
        ()=>A('Quelle phrase distingue correctement indicatif et subjonctif ?',`${c.name} espère que vous viendrez, mais il/elle veut que vous veniez.`,`${c.name} espère que vous veniez, mais il/elle veut que vous viendrez.`,`${c.name} veut que vous venez et espère que vous veniez.`,'Espérer que présente normalement un fait attendu à l’indicatif/futur; vouloir que exprime la volonté au subjonctif.'),
        ()=>A('Au subjonctif présent, quelle forme convient avec « nous » pour le verbe faire ?','que nous fassions','que nous faisons','que nous ferons','Faire est irrégulier : que je fasse, que nous fassions.')
      ],
      reported:[
        ()=>A(`${c.name} dit : « Je suis prêt(e). » Quelle reformulation est correcte ?`,`${c.name} dit qu’il/elle est prêt(e).`,`${c.name} demande s’il/elle est prêt(e).`,`${c.name} dit est-il/elle prêt(e).`,'Au présent, une affirmation rapportée se construit avec dire que + proposition.'),
        ()=>A(`« Est-ce que le service est ouvert ? » → ${c.name} demande…`,'si le service est ouvert.','que le service est ouvert ?','est-ce que le service est ouvert.','Une question fermée rapportée se construit avec demander si.'),
        ()=>A('« Où habitez-vous ? » → Il demande…','où vous habitez.','où habitez-vous.','si où vous habitez.','Le mot interrogatif est conservé et l’ordre redevient déclaratif.'),
        ()=>A(`Le conseiller explique : « Vous devez confirmer avant ${c.day}. »`,'Le conseiller explique que vous devez confirmer avant ce jour-là.','Le conseiller demande si vous devez confirmer ?','Le conseiller explique devez-vous confirmer.','Une information rapportée prend que + proposition déclarative.'),
        ()=>A('Quelle phrase rapporte une information plutôt qu’une question ?',`${c.name} dit que la réunion commencera à ${c.hour} h.`,`${c.name} demande commencera-t-elle à ${c.hour} h.`,`${c.name} demande si à ${c.hour} h ?`,'Dire que sert à rapporter une déclaration.'),
        ()=>A('Pour rapporter « Avez-vous reçu mon message ? », quelle structure faut-il utiliser ?','demander si + proposition','dire que + inversion','demander que + point d’interrogation','Une question oui/non devient demander si + ordre déclaratif.')
      ],
      negationB1:[
        ()=>A(`${c.name} n’a reçu ___ réponse.`,'aucune','pas aucune','rien de','Aucun/aucune peut déterminer directement un nom dans une négation.'),
        ()=>A(`Le service ne reçoit le public ___ le ${c.day}.`,'que','pas que','aucun','Ne…que exprime une restriction, équivalente à seulement.'),
        ()=>A(`${c.name} ne prend ___ le bus ___ le métro.`,'ni / ni','pas / ou','aucun / et','Ne…ni…ni coordonne deux éléments niés.'),
        ()=>A(`___ solution proposée ne convient à ${c.name}.`,'Aucune','Rien','Pas','Aucune s’accorde avec le nom féminin singulier solution.'),
        ()=>A(`${c.name} n’a parlé à ___.`,'personne','aucun personne','rien','Ne…personne porte sur une personne.'),
        ()=>A('Quelle phrase exprime uniquement une restriction ?',`${c.name} ne peut venir que ${c.day}.`,`${c.name} ne vient jamais ${c.day}.`,`${c.name} ne vient ni ${c.day}.`,'Ne…que signifie seulement et ne nie pas l’action elle-même.')
      ],
      passive:[
        ()=>A(`Le dossier de ${c.name} ___ demain.`,'sera envoyé','enverra été','sera envoyer','La voix passive se construit avec être conjugué + participe passé.'),
        ()=>A(`La réunion de ${c.city} ___ hier.`,'a été annulée','a annulé','a été annuler','Au passé composé passif : avoir + été + participe passé.'),
        ()=>A('« On vérifie les documents » : quelle phrase passive est correcte ?','Les documents sont vérifiés.','Les documents vérifient.','Les documents sont vérifier.','Le COD de la phrase active devient sujet de la phrase passive.'),
        ()=>A('Les lettres de confirmation sont ___.','envoyées','envoyer','envoyé','Le participe passé s’accorde avec le sujet du passif.'),
        ()=>A('Quelle phrase met surtout l’accent sur le résultat de la procédure ?','La demande a été acceptée.','Le service accepte parfois des demandes.','Nous accepterons peut-être une demande.','Le passif permet de mettre au premier plan le résultat ou le patient.'),
        ()=>A(`Le formulaire doit ___ avant ${c.day}.`,'être signé','signer être','été signer','Après un modal, le passif prend infinitif être + participe passé.')
      ],
      gerondif:[
        ()=>A('On progresse en français ___ régulièrement.','en pratiquant','en pratiquer','pratiquant de','Le gérondif se forme avec en + participe présent.'),
        ()=>A(`${c.name} écoute un podcast ___ au travail.`,'en allant','en aller','va en','Le gérondif peut exprimer deux actions simultanées avec le même sujet.'),
        ()=>A(`___ plus tôt, vous éviterez le trafic vers ${c.city}.`,'En partant','En partir','Parti en','Le gérondif peut exprimer une condition ou un moyen.'),
        ()=>A('Quelle est la forme correcte avec « faire » ?','en faisant','en faissant','en fait','Le participe présent de faire est faisant.'),
        ()=>A('Dans l’usage de base, le sujet du gérondif est normalement…','le même que celui du verbe principal.','toujours différent de celui du verbe principal.','absent et impossible à identifier.','Le gérondif partage normalement son sujet avec le verbe principal.'),
        ()=>A('Quelle phrase exprime la manière ?',`${c.name} a appris en regardant des vidéos.`,`${c.name} a appris pour regarder hier.`,`${c.name} apprendra regardé.`,'En + participe présent peut préciser la manière dont une action est réalisée.')
      ],
      ppagreement:[
        ()=>A('Inès et Sofia sont ___.','arrivées','arrivé','arriver','Avec être, le participe passé s’accorde avec le sujet.'),
        ()=>A(`Les lettres que ${c.name} a ___ sont longues.`,'écrites','écrit','écrire','Avec avoir, un COD placé avant peut entraîner l’accord du participe passé.'),
        ()=>A('Marie ? Je l’ai ___.','vue','vu','voir','Le pronom COD l’ reprend ici un nom féminin placé avant le participe.'),
        ()=>A('Thomas et Marc se sont ___ tôt.','levés','levé','lever','Dans ce cas courant de verbe pronominal, le participe s’accorde avec le sujet.'),
        ()=>A(`La décision que nous avons ___ à ${c.city} est définitive.`,'prise','pris','prendre','Que reprend décision, COD féminin singulier placé avant.'),
        ()=>A('Quelle phrase est correctement accordée ?','Elles sont parties.','Elles ont parties.','Elles sont parti.','Partir se conjugue avec être et le participe s’accorde avec elles.')
      ],
      prepositionalVerbs:[
        ()=>A(`${c.name} pense ___ changer de travail.`,'à','de','pour','Penser à + nom/infinitif.'),
        ()=>A(`${c.name} a décidé ___ partir à ${c.city}.`,'de','à','pour de','Décider de + infinitif.'),
        ()=>A('Nous avons arrêté ___ utiliser cette application.','de','à','pour','Arrêter de + infinitif.'),
        ()=>A(`${c.name} s’intéresse ___ la formation proposée.`,'à','de','pour','S’intéresser à + nom.'),
        ()=>A('Le responsable parle ___ la nouvelle procédure.','de','à','pour','Parler de quelque chose.'),
        ()=>A(`« ${c.name} pense à son avenir » : quel pronom reprend « à son avenir » ?`,'y','en','lui','À + chose peut être repris par y.')
      ],
      doublePronouns:[
        ()=>A(`Je donne le dossier à ${c.name}. → Je ___.`,'le lui donne','lui le donne','donne le lui','Le/la/les précède lui/leur devant le verbe.'),
        ()=>A(`${c.name} envoie les photos à ses parents. → ${c.name} ___.`,'les leur envoie','leur les envoie','en les leur','Les précède leur.'),
        ()=>A(`Je parle de ce problème à ${c.name}. → Je ___.`,'lui en parle','en lui parle de','le lui parle','Lui précède en dans cette combinaison.'),
        ()=>A('Tu apportes le document à moi. → Tu ___.','me l’apportes','le me apportes','m’en apportes le','Me/te/se/nous/vous précèdent le/la/les.'),
        ()=>A('Nous allons donner la réponse aux clients. → Nous allons ___.','la leur donner','leur la donner','donner leur la','Devant un infinitif, les pronoms gardent leur ordre.'),
        ()=>A('Quelle phrase place correctement les deux pronoms ?','Je vous l’envoie demain.','Je le vous envoie demain.','Je vous envoie le demain.','Vous précède le/la/l’ devant le verbe.')
      ],
      indefinitePronouns:[
        ()=>A('___ préfèrent travailler à distance.','Certains','Certain','Quelque','Certains peut être employé seul comme pronom pluriel.'),
        ()=>A(`${c.name} a invité dix personnes ; ___ sont venues.`,'plusieurs','beaucoup de','chaque','Plusieurs peut reprendre un groupe sans nom exprimé.'),
        ()=>A('___ peut participer si les conditions sont respectées.','Chacun','Chaque','Quelques de','Chacun est un pronom; chaque doit déterminer un nom.'),
        ()=>A(`${c.name} n’a vu ___.`,'personne','quelqu’un pas','aucuns','Personne peut fonctionner comme pronom dans la négation.'),
        ()=>A('Il y a deux solutions ; ___ ont des avantages.','les deux','chaque','aucune des deux sont','Les deux reprend les deux éléments mentionnés.'),
        ()=>A('Quelle phrase évite correctement la répétition de « personnes » ?','Certains sont pour, d’autres sont contre.','Certains personnes sont pour.','Quelque sont contre.','Certains/d’autres fonctionne comme paire de pronoms indéfinis.')
      ],
      relativesB1:[
        ()=>A(`Le projet ___ ${c.name} parle est important.`,'dont','que','où','Parler de appelle dont pour reprendre de + antécédent.'),
        ()=>A('C’est une information ___ nous avons besoin.','dont','que','qui','Avoir besoin de appelle dont.'),
        ()=>A(`La table sur ___ ${c.name} a posé le dossier est libre.`,'laquelle','dont','que','Après la préposition sur, on utilise ici laquelle.'),
        ()=>A(`Les collègues avec ___ ${c.name} travaille sont à ${c.city}.`,'lesquels','dont','qui','Avec + antécédent pluriel masculin/mixte donne avec lesquels.'),
        ()=>A('La raison pour ___ je téléphone est simple.','laquelle','dont','que','La préposition pour est conservée devant le pronom relatif composé.'),
        ()=>A('Quelle phrase reprend correctement « penser à ce problème » ?','Voici le problème auquel je pense.','Voici le problème que je pense à.','Voici le problème dont je pense à.','Penser à appelle auquel/à laquelle selon l’antécédent.')
      ],
      emphasis:[
        ()=>A('___ m’intéresse, c’est la solution proposée par Nora.','Ce qui','Ce que','Ce dont','Dans la relative, le pronom est sujet de « m’intéresse » : ce qui.'),
        ()=>A(`___ ${c.name} préfère, c’est partir tôt.`,'Ce que','Ce qui','Ce dont','Le pronom est COD de préfère : ce que.'),
        ()=>A('___ nous avons besoin, c’est d’une réponse claire.','Ce dont','Ce que','Ce qui','Avoir besoin de appelle ce dont.'),
        ()=>A('Ce que je veux dire, ___ que cette option est plus simple.','c’est','est','ce','Le cadre de mise en relief est « Ce que…, c’est que… ».'),
        ()=>A('Quelle phrase met clairement l’idée principale en relief ?','Ce qui est important, c’est de vérifier les horaires.','Il est important vérifier les horaires c’est.','Ce que important est horaires.','Ce qui… c’est… met un élément au premier plan.'),
        ()=>A('« J’aime surtout la liberté. » Quelle reformulation met « la liberté » en relief ?','Ce que j’aime surtout, c’est la liberté.','Ce qui j’aime, la liberté.','Ce dont j’aime est liberté.','Aimer prend un COD, donc ce que.')
      ],
      nominalisation:[
        ()=>A('Quel nom correspond au verbe « décider » ?','une décision','un décidement','une décider','Décider → décision.'),
        ()=>A('Quel nom correspond au verbe « répondre » ?','une réponse','un répondage','une répondre','Répondre → réponse.'),
        ()=>A('Quel nom correspond au verbe « s’inscrire » ?','une inscription','un inscrive','une inscritionner','S’inscrire → inscription.'),
        ()=>A('Comment nominaliser « Le service a annulé la réunion » ?','l’annulation de la réunion','annuler de la réunion','la réunion annulera','Annuler → annulation de + nom.'),
        ()=>A('Quelle formulation convient le mieux à un courriel formel ?','Après réception de votre message…','Après vous recevez message…','Après recevoir vous…','La nominalisation peut condenser une information dans un registre formel.'),
        ()=>A('Comment nominaliser « Nous avons confirmé votre réservation » ?','la confirmation de votre réservation','le confirmer votre réservation','votre réservation confirmant','Confirmer → confirmation de + nom.')
      ],
      logicalB1:[
        ()=>A(`${c.name} répète l’information ___ tout le monde comprenne.`,'pour que','parce que','donc','Pour que + subjonctif exprime le but.'),
        ()=>A(`___ ce soit plus cher, ${c.name} préfère cette option.`,'Bien que','Parce que','Donc','Bien que + subjonctif exprime la concession.'),
        ()=>A(`${c.name} est parti(e) plus tôt ___ sa maladie.`,'à cause de','par conséquent','bien que','À cause de + nom introduit une cause.'),
        ()=>A(`Le train est supprimé ; ___, ${c.name} prendra le bus.`,'par conséquent','bien que','afin que','Par conséquent introduit une conséquence.'),
        ()=>A('___ le prix élevé, l’hôtel est complet.','Malgré','Parce que','Pour que','Malgré + nom exprime une concession.'),
        ()=>A(`${c.name} prépare les documents ___ gagner du temps.`,'afin de','afin que il/elle','bien que','Quand le sujet est le même, afin de + infinitif exprime le but.')
      ],
      superlative:[
        ()=>A(`C’est ___ option la plus simple pour ${c.name}.`,'l’','une de','de','Le superlatif adjectival prend généralement l’article défini.'),
        ()=>A('Ce train est ___ rapide de tous.','le plus','plus que','le mieux de','Le plus + adjectif forme le superlatif.'),
        ()=>A('C’est la solution ___.','la moins chère','moins chère que','la moins de chère','La moins + adjectif exprime le superlatif d’infériorité.'),
        ()=>A('Quel est ___ restaurant du quartier ?','le meilleur','le plus bon','le mieux','Le superlatif de bon est meilleur.'),
        ()=>A(`${c.name} travaille ___.`,'le mieux','la meilleure','plus bonne','Le superlatif de bien est le mieux.'),
        ()=>A('Quelle phrase compare un logement à tout son groupe ?','C’est le logement le plus calme du quartier.','Ce logement est plus calme que l’autre.','Ce logement est aussi calme.','Le superlatif situe un élément par rapport à l’ensemble du groupe.')
      ],
      adverbsB1:[
        ()=>A(`Il y avait ___ ${20+c.num} personnes à la réunion.`,'environ','pendant','dont','Environ indique une quantité approximative.'),
        ()=>A(`${c.name} a ___ terminé son dossier.`,'presque','parmi','depuis','Presque signifie que l’action est proche d’être achevée.'),
        ()=>A(`___, ${c.name} a choisi la deuxième option.`,'Finalement','La veille de','Dont','Finalement marque le résultat d’un processus ou d’une hésitation.'),
        ()=>A(`Nous sommes partis ${c.day} ; ___, nous sommes arrivés à ${c.city}.`,'le lendemain','la veille','d’ici','Le lendemain désigne le jour qui suit un repère passé.'),
        ()=>A(`${c.name} avait préparé ses documents ___.`,'la veille','le lendemain de demain','vers de','La veille désigne le jour précédant un repère.'),
        ()=>A(`Je vous répondrai ___ ${c.day}.`,'d’ici','depuis','autrefois de','D’ici + date fixe une limite dans le futur.')
      ]
    };
    const list=cases[node];
    return list?list[k]():null;
  }

  function applyCase202(g,q,qi){
    const ord=generatedOrdinal202(q,qi),spec=case202(g.id,ord);
    if(!spec)return false;
    if(ord>=6){const c=context202(ord),scene=SCENES[Math.floor(ord/6)%SCENES.length];spec.stem=`${scene} ${c.city} : ${spec.stem}`;}
    const correctIndex=Math.max(0,Math.min(2,Number(q[2])||0)),others=[spec.wrong1,spec.wrong2],options=[];
    for(let i=0;i<3;i++)options[i]=i===correctIndex?spec.correct:others.shift();
    q[0]=spec.stem;q[1]=options;q[2]=correctIndex;q[3]=spec.why;
    if(q[4]&&typeof q[4]==='object')q[4].integrityRoute=ROUTE;
    return true;
  }

  /* The bank is rebuilt on every boot and never stored, so a repair applies to every
     question whether or not it was answered: a learner only ever answered the repaired
     question, and skipping it once answered would bring back the mismatched one. */
  function repairQuestionBank202(){
    const out={scanned:0,repairedMismatch:0,repairedStems:0,unresolvedMismatch:[],unresolvedIncomplete:[],exactStemDuplicates:[]};
    const seen=new Map();
    for(const g of GRAMMAR){
      const qs=grammarQuestions(g);
      for(let qi=0;qi<qs.length;qi++){
        const q=qs[qi];if(!q)continue;out.scanned++;
        if(LATE_IDS.has(g.id)&&isGenericFallback202(q)&&applyCase202(g,q,qi))out.repairedMismatch++;
        const full=clarifiedStem202(g.id,q[0]);
        if(full&&full!==q[0]){q[0]=full;out.repairedStems++;if(q[4]&&typeof q[4]==='object')q[4].integrityRoute=ROUTE;}
      }
    }
    for(const g of GRAMMAR){
      const qs=grammarQuestions(g);
      for(let qi=0;qi<qs.length;qi++){
        const q=qs[qi],id=qid202(g,q,qi),stem=norm202(q&&q[0]),key=stem.toLowerCase();
        if(LATE_IDS.has(g.id)&&isGenericFallback202(q))out.unresolvedMismatch.push({node:g.id,id,stem});
        if(clarifiedStem202(g.id,stem))out.unresolvedIncomplete.push({node:g.id,id,stem});
        if(key){if(seen.has(key))out.exactStemDuplicates.push({stem,first:seen.get(key),again:`${g.id}:${qi+1}`});else seen.set(key,`${g.id}:${qi+1}`)}
      }
    }
    out.ok=out.unresolvedMismatch.length===0&&out.unresolvedIncomplete.length===0;
    return out;
  }

  function expandSubjonctifGuide202(){
    const box=globalThis.DELF50_GRAMMAR_GUIDES_174,old=box&&box.subjonctif;
    if(!old)return;
    old.title='Subjonctif essentiel：从“触发意义”判断，再完成变位';
    old.why='B1 阶段的重点不是把所有带 que 的句子都改成虚拟式，而是识别必要、愿望/情感、目的、让步等高频触发意义，并能与表示事实、判断或期待的直陈式区分。';
    old.formula=[
      '判断顺序：先看主句表达的意义（必要/愿望/情感/目的/让步），再看是否出现 que，最后做 subjonctif 变位。',
      '规则构成：通常取 ils 的 présent 词干去 -ent，再加 -e, -es, -e, -ions, -iez, -ent：ils parlent → que je parle / que nous parlions。',
      '常见双词干：ils viennent / nous venons → que je vienne, que nous venions；ils prennent / nous prenons → que je prenne, que nous prenions。',
      '高频不规则 être：sois, sois, soit, soyons, soyez, soient；avoir：aie, aies, ait, ayons, ayez, aient。',
      '高频不规则 faire：fasse…fassions；pouvoir：puisse…puissions；savoir：sache…sachions；aller：aille…allions。',
      '必要/判断：il faut que, il est important/nécessaire que + subjonctif。',
      '愿望/态度/情感：vouloir, souhaiter, préférer, être content/triste que + subjonctif。',
      '目的：pour que / afin que + subjonctif；同一主语时通常更自然用 pour/afin de + infinitif。',
      '让步：bien que + subjonctif；这是 B1 观点表达里很实用的“承认反方”结构。',
      '否定意见/不确定：je ne pense pas que / je ne crois pas que 常引出 subjonctif；肯定 je pense que / je crois que 通常用 indicatif。'
    ];
    old.contrast=[
      'J’espère que vous viendrez. → espérer 把到来看作期待中的事实，通常用 indicatif/futur。',
      'Je veux que vous veniez. → vouloir 表达主观愿望，使用 subjonctif。',
      'Il faut partir. → 同一动作主体，用 infinitif；Il faut que vous partiez. → 引出明确主语，用 subjonctif。',
      'Je travaille pour réussir. → 同主语；Je répète pour que vous compreniez. → 两个不同主语。',
      'Je pense que cette solution est utile. / Je ne pense pas que cette solution soit suffisante. → 事实判断与否定判断对比。'
    ];
    old.errors=[
      'Il faut que vous venez ✗ → Il faut que vous veniez ✓。',
      'Pour que vous pouvez confirmer ✗ → pour que vous puissiez confirmer ✓。',
      'Je veux que nous trouvons ✗ → je veux que nous trouvions ✓。',
      '把所有 que 都当作虚拟式触发词：que 本身不决定语气，主句意义才决定。',
      '混淆同主语与不同主语：Je viens pour vous aider（infinitif）/ Je viens pour que vous puissiez travailler（subjonctif）。',
      '只背 je/tu/il 形式，忽略 nous/vous 的 -ions/-iez，导致口语和写作中高频出错。'
    ];
    old.delf=[
      'Production écrite：Il est important que… / Je souhaite que… 用于建议、要求和正式请求。',
      'Point de vue：Bien que…, je pense que… 用于承认反方后坚持立场。',
      'Interaction：Je préférerais que… / Il faudrait que… 用于协商更合适的解决方案。',
      '目的表达：Je vous écris pour que vous puissiez…，尤其适合邮件与投诉任务。'
    ];
    old.production=[
      '用 il faut que / il est important que 各造3句，并覆盖 je/nous/vous。',
      '把4组“同主语 pour + infinitif”改写为“不同主语 pour que + subjonctif”。',
      '对比写6组：espérer que + indicatif/futur / vouloir que + subjonctif。',
      '用 bien que 写3句“承认缺点→给出立场”的 B1 观点句。'
    ];
  }

  function installStyle202(){
    if(typeof document==='undefined'||document.getElementById('grammar-integrity-202-style'))return;
    const s=document.createElement('style');s.id='grammar-integrity-202-style';
    s.textContent='.greview202{margin-top:10px}.greview202 .reviewline202{margin-top:6px;line-height:1.65}.gclarify202{margin:8px 0}.subjquick202{margin:10px 0}.subjgrid202{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.subjgrid202>div{border:1px solid var(--line);border-radius:12px;padding:10px;background:#fbfdfc}.subjgrid202 b{display:block;margin-bottom:5px}@media(max-width:640px){.subjgrid202{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  function answerRecord202(day,g,q,qi){const id=qid202(g,q,qi),key=`${day}:${id}`;return S.grammarReview202&&S.grammarReview202[key]||null}
  function makeReviewHtml202(day,g,q,qi){
    const id=qid202(g,q,qi),exact=answerRecord202(day,g,q,qi),hist=completion202(day,id),correctIndex=Number(q[2]),correctText=q[1]&&q[1][correctIndex];
    if(exact){
      const sel=Number(exact.selectedIndex),ok=sel===correctIndex;
      return `<div class="callout ${ok?'good':'bad'} greview202"><b>${ok?'历史作答：正确':'历史作答：需复盘'}</b><div class="reviewline202">你的答案：${abc202(sel)}. ${esc202(exact.options&&exact.options[sel]!==undefined?exact.options[sel]:(q[1]&&q[1][sel]))}<br>正确答案：${abc202(correctIndex)}. ${esc202(correctText)}<br>${esc202(q[3]||'')}</div></div>`;
    }
    if(hist&&typeof hist.correct==='boolean'){
      const ok=hist.correct===true;
      const detail=ok?`旧版本只保存了“正确/错误”，没有保存逐题点击索引；因为该题记录为正确，可以确定正确选项为 ${abc202(correctIndex)}. ${esc202(correctText)}。`:`旧版本保存了“错误”结果，但没有保存当时点击的错误选项，因此这里不推测你的原选择。正确答案是 ${abc202(correctIndex)}. ${esc202(correctText)}。`;
      return `<div class="callout ${ok?'good':'warn'} greview202"><b>${ok?'历史结果：正确':'历史结果：需复盘'}</b><div class="reviewline202">${detail}<br>${esc202(q[3]||'')}</div></div>`;
    }
    return '<div class="callout blue greview202"><b>历史题目</b><div class="reviewline202">旧版本仅保留了完成数量，没有足够的逐题答案证据；这里不补造你的选择。</div></div>';
  }
  function decorateGrammar202(html){
    if(typeof document==='undefined')return html;
    try{
      const g=GRAMMAR[UI.gNode],qs=grammarQuestions(g),qi=((Number(UI.gQ)||0)%Math.max(1,qs.length)+qs.length)%qs.length,q=qs[qi];
      if(!g||!q)return html;
      const t=document.createElement('template');t.innerHTML=String(html||'');
      const card=t.content.querySelector('.gquestion176');if(!card)return html;
      const historical=/已完成\s*[·・]\s*回看|历史完成/.test(t.content.textContent||'')||!!completion202(S.selectedDay,qid202(g,q,qi));
      const clar=clarifiedStem202(g.id,q[0]);
      if(clar&&historical){const h=card.querySelector('h2');if(h&&!card.querySelector('.gclarify202')){const n=document.createElement('div');n.className='callout blue gclarify202';n.innerHTML='<b>题干补全说明</b><br>'+esc202(clar)+'<br><span class="muted">仅补全问法；历史 Content ID、选项、正确答案索引和判定均未改变。</span>';h.insertAdjacentElement('afterend',n)}}
      if(historical){
        const exact=answerRecord202(S.selectedDay,g,q,qi),hist=completion202(S.selectedDay,qid202(g,q,qi)),opts=card.querySelectorAll('[data-gopt]'),correct=Number(q[2]);
        if(opts[correct])opts[correct].classList.add('good');
        if(exact&&Number.isInteger(Number(exact.selectedIndex))){const sel=Number(exact.selectedIndex);if(opts[sel]){opts[sel].classList.add('on');if(sel!==correct)opts[sel].classList.add('bad')}}else if(hist&&hist.correct===true&&opts[correct])opts[correct].classList.add('on');
        let old=null;card.querySelectorAll('.callout').forEach(x=>{if(!old&&/已完成题目/.test(x.textContent||''))old=x});
        const holder=document.createElement('div');holder.innerHTML=makeReviewHtml202(S.selectedDay,g,q,qi);const repl=holder.firstElementChild;
        if(old)old.replaceWith(repl);else if(!card.querySelector('.greview202')){const detail=card.querySelector('.gdetail176');if(detail)detail.insertAdjacentElement('beforebegin',repl);else card.appendChild(repl)}
        if(LATE_IDS.has(g.id)&&isGenericFallback202(q)){const w=document.createElement('div');w.className='callout warn';w.innerHTML='<b>旧版本历史题</b><br>该题属于旧版扩容模板，因已有学习证据而原样保留；新题库已停止向未完成槽位分配这类错配模板。';const r=card.querySelector('.greview202');if(r)r.insertAdjacentElement('afterend',w)}
      }
      if(g.id==='subjonctif'){
        if(!card.querySelector('.subjquick202')){const h=card.querySelector('h2'),n=document.createElement('div');n.className='callout blue subjquick202';n.innerHTML='<b>虚拟式做题四步</b><br>① 找主句态度/功能：必要、愿望/情感、目的、让步 → ② 判断是否需要 que + 明确主语 → ③ 区分 indicatif（事实/期待）与 subjonctif（主观态度/非事实性）→ ④ 再做变位，特别检查 nous/vous 与不规则词。';if(h)h.insertAdjacentElement('beforebegin',n)}
        const d=card.querySelector('.gdetail176'),body=d&&d.querySelector('.gdetailbody176');
        if(d&&d.querySelector('summary'))d.querySelector('summary').textContent='虚拟式精讲：构成、触发词、直陈式对比与 DELF 用法';
        if(body&&!body.querySelector('.subjgrid202')){const x=document.createElement('div');x.className='subjgrid202';x.innerHTML='<div><b>先判断意义，不看 que 猜答案</b><span class="muted">必要/判断：il faut que, il est important que；愿望/情感：vouloir/souhaiter/être content que；目的：pour que/afin que；让步：bien que。</span></div><div><b>同主语 vs 不同主语</b><span class="muted">Je travaille pour réussir. / Je répète pour que vous compreniez. 同主语优先 infinitif，不同主语常用 pour que + subjonctif。</span></div><div><b>Indicatif 对比</b><span class="muted">J’espère que vous viendrez；Je pense que c’est utile。与 Je veux que vous veniez；Je ne pense pas que ce soit suffisant 对比。</span></div><div><b>高频不规则</b><span class="muted">être → sois/soyons；avoir → aie/ayons；faire → fasse/fassions；pouvoir → puisse/puissions；aller → aille/allions。</span></div>';body.appendChild(x)}
      }
      return t.innerHTML;
    }catch(e){return html}
  }

  const evidenceBefore202=(()=>{try{return JSON.stringify({daily:S.daily,taskDone:S.taskDone,prodDone:S.prodDone,grammar:{attempts:S.grammar&&S.grammar.attempts,correct:S.grammar&&S.grammar.correct,skill:S.grammar&&S.grammar.skill},contentProgress:S.contentProgress172,assignments:S.assignments172,reading:S.reading&&S.reading.answers,listening:S.listening&&S.listening.answers,writing:S.writing&&S.writing.records,application:S.application&&S.application.records,speaking:S.speaking&&S.speaking.records})}catch(e){return null}})();
  expandSubjonctifGuide202();
  const report202=repairQuestionBank202();
  S.grammarReview202=S.grammarReview202||{};
  installStyle202();

  if(typeof submitGrammar==='function'){
    const submitPrev202=submitGrammar;
    submitGrammar=function(){
      try{
        if(UI.gSel!==null){
          const g=GRAMMAR[UI.gNode],qs=grammarQuestions(g),qi=((Number(UI.gQ)||0)%Math.max(1,qs.length)+qs.length)%qs.length,q=qs[qi],id=qid202(g,q,qi),key=`${S.selectedDay}:${id}`;
          S.grammarReview202=S.grammarReview202||{};
          if(!S.grammarReview202[key])S.grammarReview202[key]={day:Number(S.selectedDay),contentId:id,nodeId:g.id,nodeName:g.name,question:String(q[0]),options:clone202(q[1]||[]),selectedIndex:Number(UI.gSel),correctIndex:Number(q[2]),correct:Number(UI.gSel)===Number(q[2]),explanation:String(q[3]||''),answeredAt:new Date().toISOString(),route:ROUTE};
        }
      }catch(e){}
      return submitPrev202.apply(this,arguments);
    };
  }
  if(typeof grammar==='function'){
    const grammarPrev202=grammar;
    grammar=function(){return decorateGrammar202(grammarPrev202.apply(this,arguments))};
  }

  const evidenceAfter202=(()=>{try{return JSON.stringify({daily:S.daily,taskDone:S.taskDone,prodDone:S.prodDone,grammar:{attempts:S.grammar&&S.grammar.attempts,correct:S.grammar&&S.grammar.correct,skill:S.grammar&&S.grammar.skill},contentProgress:S.contentProgress172,assignments:S.assignments172,reading:S.reading&&S.reading.answers,listening:S.listening&&S.listening.answers,writing:S.writing&&S.writing.records,application:S.application&&S.application.records,speaking:S.speaking&&S.speaking.records})}catch(e){return null}})();
  report202.learningEvidencePreserved=evidenceBefore202===evidenceAfter202;
  report202.route=ROUTE;report202.appVersion=APP;report202.contentVersion=CONTENT;
  if(S.meta172){S.meta172.appVersion=APP;S.meta172.contentVersion=CONTENT;S.meta172.grammarIntegrity=ROUTE;S.meta172.grammarHistory='exact-answer-additive-v1';S.meta172.historyPolicy='started-completed-content-immutable'}
  globalThis.DELF50_GRAMMAR_INTEGRITY_202={version:APP,contentVersion:CONTENT,route:ROUTE,report:report202,run:repairQuestionBank202,clarifiedStem:clarifiedStem202};
  if(typeof render==='function')render();
}

if(typeof module==='object'&&module.exports){
  module.exports='('+installGrammarIntegrity202.toString()+')();';
}else{
  installGrammarIntegrity202();
}
