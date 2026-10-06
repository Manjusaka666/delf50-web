'use strict';
(function(){
  const V16='1.6.0';
  const readings=(typeof V13_READINGS!=='undefined')?V13_READINGS:READINGS;
  const listenings=(typeof V13_LISTENINGS!=='undefined')?V13_LISTENINGS:LISTENINGS;
  const writings=(typeof V13_WRITINGS!=='undefined')?V13_WRITINGS:WRITINGS;
  const speakings=(typeof V13_SPEAKING!=='undefined')?V13_SPEAKING:SPEAKING;
  const applications=(typeof V13_APPLICATION!=='undefined')?V13_APPLICATION:APPLICATION;
  function pushUnique(bank,items){for(const x of items){if(!bank.some(y=>y.id===x.id))bank.push(x)}}
  function addQ(id,items){GRAMMAR_EXTRA[id]=GRAMMAR_EXTRA[id]||[];for(const q of items){const sig=q[0]+'|'+q[1].join('|');if(!GRAMMAR_EXTRA[id].some(z=>z[0]+'|'+z[1].join('|')===sig))GRAMMAR_EXTRA[id].push(q)}}

  addQ('present',[
    ['Je ___ à sept heures tous les jours.',['me lève','me lever','se lève'],0,'Avec je : je me lève.'],
    ['Nous ___ le dîner ensemble le soir.',['préparons','prépare','préparer'],0,'Avec nous, le verbe en -er prend généralement -ons.'],
    ['Tu ___ souvent tes amis le week-end.',['vois','voit','voir'],0,'voir : je vois, tu vois, il/elle voit.'],
    ['Ils ___ leurs devoirs après le cours.',['font','font de','faire'],0,'faire au présent avec ils : ils font.'],
    ['Elle ___ au travail en vélo.',['va','vas','aller'],0,'aller avec elle : elle va.'],
    ['On ___ français pendant la pause.',['parle','parlons','parlent'],0,'Le pronom on se conjugue comme il/elle.'],
    ['Vous ___ une question ?',['avez','êtes','faites de'],0,'avoir avec vous : vous avez.']
  ]);
  addQ('negation',[
    ['Je ___ regarde ___ la télévision le matin.',['ne / pas','pas / ne','ne / rien de'],0,'La négation simple encadre le verbe conjugué.'],
    ['Il n’habite ___ ici.',['plus','pas de','rien'],0,'ne…plus signifie que la situation a cessé.'],
    ['Nous ne voyons ___ dans la rue.',['personne','pas personne','jamais personne de'],0,'ne…personne porte sur une personne absente.'],
    ['Elle n’a ___ compris.',['rien','pas rien','personne de'],0,'ne…rien exprime l’absence de chose.'],
    ['Après la négation : Je bois du café → Je ne bois pas ___ café.',['de','du','le'],0,'Après une négation simple, du/de la/des deviennent généralement de.']
  ]);
  addQ('questions',[
    ['___ est votre adresse ?',['Quelle','Quel','Quels'],0,'adresse est féminin singulier : quelle.'],
    ['___ allez-vous au travail ? — En bus.',['Comment','Pourquoi','Quand de'],0,'Comment interroge sur la manière.'],
    ['___ personnes viennent ce soir ?',['Combien de','Combien','Quel de'],0,'Combien de + nom.'],
    ['Vous partez demain ? → forme avec est-ce que :',['Est-ce que vous partez demain ?','Est-ce vous partez demain ?','Que vous partez demain ?'],0,'Est-ce que + phrase affirmative.'],
    ['___ est-ce que le cours commence ? — À neuf heures.',['Quand','Où de','Combien'],0,'Quand interroge sur le moment.']
  ]);
  addQ('modals',[
    ['Je ___ apprendre à mieux parler français.',['veux','veux de','vouloir'],0,'vouloir + infinitif, sans préposition.'],
    ['On ___ réserver en ligne.',['peut','peux','pouvons de'],0,'Avec on : on peut.'],
    ['Tu ___ dormir davantage.',['devrais','devrais de','dois à'],0,'Le conditionnel de devoir sert souvent à conseiller.'],
    ['Nous ___ finir avant 18 h.',['devons','devons de','devoir'],0,'devoir + infinitif.'],
    ['Pour une demande polie : « ___-vous fermer la fenêtre ? »',['Pourriez','Pouvez de','Voulez de'],0,'Pourriez-vous…? atténue la demande.']
  ]);
  addQ('articles',[
    ['Je prends ___ café et ___ eau.',['du / de l’','de la / du','un de / une de'],0,'Partitif : du café, de l’eau.'],
    ['Nous achetons trois bouteilles ___ eau.',['d’','de l’','des'],0,'Après une quantité : de/d’.'],
    ['Il mange beaucoup ___ légumes.',['de','des','du'],0,'beaucoup de + nom.'],
    ['Elle aime ___ musique classique.',['la','de la','une'],0,'Pour parler d’une catégorie en général après aimer : article défini.'],
    ['Vous avez ___ frères ?',['des','de la','du'],0,'Nom comptable pluriel indéfini : des frères.']
  ]);
  addQ('adjectives',[
    ['Une solution simple et ___.',['efficace','efficaces','efficacé'],0,'efficace a la même forme au masculin/féminin singulier.'],
    ['Des personnes très ___.',['gentilles','gentil','gentille'],0,'féminin pluriel : gentilles.'],
    ['Un appartement assez ___.',['lumineux','lumineuse','lumineuses'],0,'masculin singulier : lumineux.'],
    ['Une rue ___.',['bruyante','bruyant','bruyants'],0,'féminin singulier : bruyante.'],
    ['Des transports publics ___.',['pratiques','pratique','pratiqués'],0,'pluriel : pratiques.']
  ]);
  addQ('prepositions',[
    ['Je vais ___ travail à huit heures.',['au','à la','en'],0,'au = à + le travail.'],
    ['Elle revient ___ Espagne demain.',['d’','de l’','du'],0,'revenir de + pays féminin commençant par voyelle : d’Espagne.'],
    ['Nous habitons ici ___ 2024.',['depuis','pendant','il y a pendant'],0,'depuis + point de départ pour une situation encore vraie.'],
    ['Il a travaillé à Lyon ___ trois mois, puis il est parti.',['pendant','depuis','dans'],0,'Durée terminée : pendant.'],
    ['Le rendez-vous est ___ lundi matin.',['pour','en','depuis'],0,'pour peut indiquer une date prévue : pour lundi.']
  ]);
  addQ('pc',[
    ['Hier, j’___ mes courses après le travail.',['ai fait','faisais toujours','fais'],0,'Action terminée hier : passé composé.'],
    ['Nous ___ au restaurant samedi soir.',['avons mangé','sommes mangé','mangions une fois'],0,'manger se conjugue avec avoir.'],
    ['Mes amies ___ très tôt.',['sont parties','ont parti','partaient soudain'],0,'partir se conjugue avec être et s’accorde avec le sujet.'],
    ['Tu ___ ce message ?',['as reçu','es reçu','recevais demain'],0,'recevoir au passé composé : avoir + reçu.'],
    ['Ils ___ leurs billets en ligne.',['ont acheté','sont achetés','achetaient hier une fois'],0,'acheter : avoir + acheté.']
  ]);
  addQ('imparfait',[
    ['Quand j’étais étudiant, je ___ le bus chaque matin.',['prenais','ai pris une fois','prendrai'],0,'Habitude passée : imparfait.'],
    ['La salle ___ petite mais agréable.',['était','a été soudain','sera'],0,'Description / état de fond : imparfait.'],
    ['Nous ___ souvent nos vacances en Bretagne.',['passions','avons passé une fois','passerons'],0,'Habitude répétée : imparfait.'],
    ['Vous ___ beaucoup de sport à cette époque.',['faisiez','avez fait hier','ferez'],0,'faire à l’imparfait avec vous : faisiez.'],
    ['Il y ___ beaucoup de monde dans la rue.',['avait','a eu soudain','aura'],0,'Il y avait décrit un contexte passé.']
  ]);
  addQ('pcimp',[
    ['Je ___ quand mon téléphone ___.',['cuisinais / a sonné','ai cuisiné / sonnait','cuisinerai / sonne'],0,'Action en cours = imparfait ; interruption = passé composé.'],
    ['Pendant que nous ___, le train ___.',['attendions / est arrivé','avons attendu / arrivait','attendons / arrivera'],0,'Le cadre dure ; l’événement arrive.'],
    ['Elle ___ très fatiguée, alors elle ___ tôt.',['était / est rentrée','a été / rentrait','sera / rentre'],0,'État : imparfait ; action terminée : passé composé.'],
    ['Il ___ quand nous ___ de la maison.',['pleuvait / sommes sortis','a plu / sortions une fois','pleut / sortirons'],0,'Météo de fond + événement ponctuel.'],
    ['Quand j’___ petit, j’___ une fois la tour Eiffel avec ma classe.',['étais / ai visitée','ai été / visitais une fois','serai / visite'],0,'Cadre général à l’imparfait, événement unique au passé composé.']
  ]);
  addQ('future',[
    ['Ce soir, nous ___ regarder un film.',['allons','avons','sommes'],0,'aller au présent + infinitif = futur proche.'],
    ['Dans quelques années, je ___ peut-être à l’étranger.',['travaillerai','travaillais','ai travaillé'],0,'Projection future : futur simple.'],
    ['Vous ___ les résultats demain matin.',['recevrez','receviez','avez reçu hier'],0,'futur simple avec vous : recevrez.'],
    ['Il ___ pleuvoir cet après-midi.',['va','vient de','a'],0,'Prévision proche : il va pleuvoir.'],
    ['Nous ___ plus de temps la semaine prochaine.',['aurons','avions','avons eu'],0,'avoir au futur simple : nous aurons.']
  ]);
  addQ('codcoi',[
    ['Je vois Marie → Je ___ vois.',['la','lui','en'],0,'Marie est COD : la.'],
    ['Nous répondons à nos collègues → Nous ___ répondons.',['leur','les','y'],0,'à + personnes pluriel : leur.'],
    ['Tu invites Paul et Léa → Tu ___ invites.',['les','leur','en'],0,'COD pluriel : les.'],
    ['Elle donne le document à Marc → Elle ___ donne le document.',['lui','le','y'],0,'à Marc = COI : lui.'],
    ['Je connais cette ville → Je ___ connais bien.',['la','lui','y'],0,'ville est COD féminin singulier : la.']
  ]);
  addQ('yen',[
    ['Vous allez au bureau ? Oui, nous ___ allons.',['y','en','le'],0,'à + lieu : y.'],
    ['Tu veux trois pommes ? Oui, j’___ veux trois.',['en','y','les de'],0,'en reprend une quantité.'],
    ['Elle revient de Paris ? Oui, elle ___ revient.',['en','y','le'],0,'de + lieu : en.'],
    ['Vous participez à ce projet ? Oui, nous ___ participons.',['y','en','le'],0,'participer à + chose : y.'],
    ['Il parle souvent de ses études ? Oui, il ___ parle souvent.',['en','y','les'],0,'parler de + chose : en.']
  ]);
  addQ('relatives',[
    ['La collègue ___ travaille avec moi est belge.',['qui','que','où'],0,'Le pronom est sujet de travaille : qui.'],
    ['Le document ___ vous cherchez est sur la table.',['que','qui','où'],0,'Le document est COD de cherchez : que.'],
    ['C’est le café ___ nous nous retrouvons souvent.',['où','qui','que'],0,'Lieu : où.'],
    ['J’aime les personnes ___ parlent clairement.',['qui','que','où'],0,'qui est sujet du verbe parlent.'],
    ['Voici la solution ___ je préfère.',['que','qui','où'],0,'que est COD de préfère.']
  ]);
  addQ('conditionnel',[
    ['Je ___ avoir plus d’informations.',['voudrais','voudrai hier','voulais demain'],0,'Je voudrais est une formule de demande polie.'],
    ['Vous ___ essayer cette solution.',['pourriez','pouviez demain','pouvez de'],0,'Vous pourriez sert à proposer/conseiller avec politesse.'],
    ['À ta place, je ___ plus tôt.',['partirais','partirai hier','partais demain'],0,'Conseil hypothétique : conditionnel présent.'],
    ['___-il possible de reporter le rendez-vous ?',['Serait','Sera','Était demain'],0,'Serait-il possible…? est une structure polie très utile.'],
    ['Nous ___ venir samedi si cela vous convient.',['pourrions','pouvons de','pourrons hier'],0,'Conditionnel : nous pourrions.']
  ]);
  addQ('connectors',[
    ['Pour ajouter un second point, on peut dire :',['Ensuite,…','Pourtant,…','Parce que…'],0,'Ensuite organise la progression.'],
    ['Pour exprimer une conséquence :',['C’est pourquoi…','Même si…','Par exemple…'],0,'C’est pourquoi introduit une conséquence.'],
    ['Pour donner un exemple concret :',['Prenons le cas de…','Cependant…','En revanche que…'],0,'Prenons le cas de… sert à illustrer.'],
    ['Pour opposer deux aspects :',['En revanche,…','Donc,…','D’abord parce…'],0,'En revanche marque un contraste.'],
    ['Pour conclure sans répéter mot à mot :',['En résumé,…','À cause de…','Même si…'],0,'En résumé permet de synthétiser.']
  ]);
  addQ('comparison',[
    ['Le train est ___ confortable que le bus.',['plus','beaucoup de','très que'],0,'plus + adjectif + que.'],
    ['Cette option est ___ chère que l’autre.',['moins','moins de','peu que'],0,'moins + adjectif + que.'],
    ['Les deux solutions sont ___ pratiques.',['aussi','autant de','plus de'],0,'aussi + adjectif exprime l’égalité.'],
    ['Il travaille ___ que son collègue.',['autant','aussi de','plus de très'],0,'Avec un verbe : autant que.'],
    ['Nous avons ___ temps qu’eux.',['autant de','aussi','plus très'],0,'Avec un nom : autant de + nom + que.']
  ]);
  addQ('opinion',[
    ['Pour introduire une réserve :',['Je comprends cet argument, mais…','Par conséquent seulement…','Premièrement de…'],0,'Cette formule reconnaît un point avant de nuancer.'],
    ['Pour justifier une opinion :',['En effet,…','Pour conclure,…','D’un côté seulement…'],0,'En effet introduit une explication/justification.'],
    ['Pour structurer deux aspects :',['D’un côté… d’un autre côté…','Parce que… donc que…','Finalement de…'],0,'Cette paire organise deux perspectives.'],
    ['Pour reformuler l’idée principale :',['Autrement dit,…','Par exemple,…','Malgré que de…'],0,'Autrement dit reformule.'],
    ['Pour terminer un point de vue :',['Pour conclure, je dirais que…','D’abord, je termine…','À cause de conclusion…'],0,'Formule claire de conclusion orale/écrite.']
  ]);

  pushUnique(applications,[
    {id:'a16-01',minDay:1,topic:'Cours',title:'S’inscrire à un cours',task:'Vous téléphonez à une école de langues. Demandez les jours de cours, le prix, le niveau et comment vous inscrire.',keys:['cours','prix','inscri'],chunks:['Je voudrais des informations sur…','Quels jours avez-vous cours ?','Comment puis-je m’inscrire ?']},
    {id:'a16-02',minDay:1,topic:'Quartier',title:'Demander son chemin',task:'Vous cherchez la pharmacie. Demandez le chemin, vérifiez que vous avez compris et remerciez.',keys:['pharmacie','droite','merci'],chunks:['Excusez-moi, où se trouve… ?','Je tourne à droite après… ?','Merci beaucoup pour votre aide.']},
    {id:'a16-03',minDay:3,topic:'Rendez-vous',title:'Changer une heure',task:'Vous ne pouvez pas venir à 14 h. Expliquez brièvement et proposez 16 h ou le lendemain.',keys:['peux','heure','demain'],chunks:['Je ne peux pas venir à…','Est-ce que 16 h serait possible ?','Sinon, je suis disponible demain.']},
    {id:'a16-04',minDay:5,topic:'Restaurant',title:'Signaler une erreur',task:'Votre commande n’est pas correcte. Expliquez calmement l’erreur et demandez le bon plat.',keys:['command','désolé','voudrais'],chunks:['Excusez-moi, j’avais commandé…','Je pense qu’il y a une erreur.','Je voudrais le plat que j’ai commandé.']},
    {id:'a16-05',minDay:8,topic:'Voyage',title:'Bagage perdu',task:'Votre valise n’est pas arrivée. Décrivez-la, dites quand vous êtes arrivé et demandez la procédure.',keys:['valise','arrivé','faire'],chunks:['Ma valise n’est pas arrivée.','Je suis arrivé(e) par le vol…','Qu’est-ce que je dois faire maintenant ?']},
    {id:'a16-06',minDay:12,topic:'Santé',title:'À la pharmacie',task:'Expliquez vos symptômes, dites depuis quand vous les avez et demandez un conseil.',keys:['depuis','mal','conseil'],chunks:['Depuis deux jours, j’ai…','J’ai mal à…','Qu’est-ce que vous me conseillez ?']},
    {id:'a16-07',minDay:15,topic:'Logement',title:'Réparation urgente',task:'Un appareil important ne fonctionne plus. Expliquez depuis quand, les conséquences et demandez une intervention.',keys:['fonctionne','depuis','réparer'],chunks:['Depuis hier, … ne fonctionne plus.','Le problème, c’est que…','Pourriez-vous envoyer quelqu’un ?']},
    {id:'a16-08',minDay:19,topic:'Travail',title:'Refuser une réunion',task:'Vous ne pouvez pas participer à une réunion. Expliquez pourquoi et proposez deux autres horaires.',keys:['réunion','disponible','propose'],chunks:['Je ne serai malheureusement pas disponible.','Je vous propose…','Est-ce qu’un de ces horaires vous conviendrait ?']},
    {id:'a16-09',minDay:22,topic:'Études',title:'Travail de groupe',task:'Un membre du groupe ne répond pas. Relancez-le poliment, rappelez la date limite et proposez une organisation.',keys:['groupe','date','propose'],chunks:['Je me permets de te relancer…','La date limite est…','Je propose que nous…']},
    {id:'a16-10',minDay:25,topic:'Service client',title:'Livraison en retard',task:'Votre commande devait arriver hier. Demandez où elle se trouve et une solution si elle n’arrive pas aujourd’hui.',keys:['commande','retard','solution'],chunks:['Ma commande devait arriver…','Pouvez-vous vérifier où elle se trouve ?','Si elle n’arrive pas, je souhaiterais…']},
    {id:'a16-11',minDay:28,topic:'Projet',title:'Convaincre une association',task:'Proposez une journée sans voiture dans le quartier. Donnez deux bénéfices et répondez à une objection.',keys:['propose','avantage','mais'],chunks:['Je propose d’organiser…','Cela permettrait de…','Je comprends cette inquiétude, mais…']},
    {id:'a16-12',minDay:31,topic:'DELF interaction',title:'Négocier une solution',task:'Un cours a été annulé sans remboursement. Vous discutez avec le responsable : expliquez les faits, refusez une solution insuffisante et négociez.',keys:['annulé','rembours','préfér'],chunks:['Le cours a été annulé…','Cette solution ne me convient pas vraiment.','Je préférerais…']}
  ]);

  pushUnique(readings,[
    {id:'r16-01',minDay:1,title:'Inscription à la piscine',text:'La piscine municipale ouvre à 7 h 30 du lundi au vendredi et à 9 h le week-end. Pour s’inscrire, il faut apporter une photo et une pièce d’identité. Les étudiants bénéficient d’un tarif réduit.',qs:[['À quelle heure ouvre la piscine en semaine ?',['7 h 30','9 h','10 h'],0],['Que faut-il apporter ?',['Une photo et une pièce d’identité','Un ordinateur','Un certificat de travail'],0],['Qui paie moins cher ?',['Les étudiants','Tous les touristes','Les enfants uniquement'],0]]},
    {id:'r16-02',minDay:1,title:'Covoiturage entre collègues',text:'Sophie travaille à quinze kilomètres de chez elle. Depuis ce mois-ci, elle va au bureau avec deux collègues. Ils partagent les frais d’essence et changent de conducteur chaque semaine. Sophie trouve cette solution moins chère et plus agréable.',qs:[['Avec qui Sophie va-t-elle au bureau ?',['Deux collègues','Ses voisins','Son frère'],0],['Que partagent-ils ?',['Les frais d’essence','Le salaire','Un abonnement de train'],0],['Pourquoi aime-t-elle cette solution ?',['Elle est moins chère et agréable','Elle est plus rapide à pied','Elle travaille moins'],0]]},
    {id:'r16-03',minDay:1,title:'Note de voisinage',text:'Bonjour à tous. Samedi matin, l’ascenseur sera arrêté entre 8 h et 12 h pour une réparation. Les personnes qui ont besoin d’aide peuvent contacter le gardien avant vendredi soir.',qs:[['Quand l’ascenseur sera-t-il arrêté ?',['Samedi matin','Vendredi matin','Dimanche soir'],0],['Pourquoi ?',['Pour une réparation','Pour un déménagement','Pour économiser'],0],['Qui peut-on contacter ?',['Le gardien','Le médecin','La mairie'],0]]},
    {id:'r16-04',minDay:3,title:'Cours déplacé',text:'Le cours de conversation de jeudi est exceptionnellement déplacé en salle 204. Il commencera à 18 h 15 au lieu de 18 h. Les étudiants doivent préparer une courte présentation sur leur ville.',qs:[['Dans quelle salle aura lieu le cours ?',['204','104','214'],0],['À quelle heure commence-t-il ?',['18 h 15','18 h','19 h 15'],0],['Que faut-il préparer ?',['Une présentation sur sa ville','Un examen écrit','Un repas'],0]]},
    {id:'r16-05',minDay:5,title:'Location de vélo',text:'Le service VéloPlus propose des vélos à la journée. Le tarif normal est de 18 euros, mais les moins de 26 ans paient 14 euros. Il faut rendre le vélo avant 19 h. En cas de pluie forte, la réservation peut être déplacée gratuitement.',qs:[['Quel est le tarif pour les moins de 26 ans ?',['14 euros','18 euros','26 euros'],0],['Avant quelle heure faut-il rendre le vélo ?',['19 h','18 h','20 h'],0],['Que peut-on faire en cas de forte pluie ?',['Déplacer la réservation gratuitement','Garder le vélo une semaine','Annuler avec une amende'],0]]},
    {id:'r16-06',minDay:8,title:'Voyage interrompu',text:'Lors d’un trajet vers Bordeaux, le train de Karim s’est arrêté pendant quarante minutes à cause d’un problème technique. Il a raté sa correspondance, mais la compagnie lui a proposé un autre train sans frais supplémentaires.',qs:[['Pourquoi le train s’est-il arrêté ?',['Un problème technique','Une grève annoncée','La météo uniquement'],0],['Qu’a raté Karim ?',['Sa correspondance','Son hôtel','Son rendez-vous médical'],0],['Quelle solution a été proposée ?',['Un autre train sans frais','Un taxi payant','Aucune solution'],0]]},
    {id:'r16-07',minDay:12,title:'Consultation sans rendez-vous',text:'Une maison de santé ouvre désormais une consultation sans rendez-vous le mardi et le jeudi de 8 h à 10 h. Elle est destinée aux problèmes simples et urgents. Pour un suivi régulier, les patients doivent continuer à prendre rendez-vous avec leur médecin.',qs:[['Quels jours existe la consultation sans rendez-vous ?',['Mardi et jeudi','Lundi et mercredi','Tous les jours'],0],['À quels problèmes est-elle destinée ?',['Aux problèmes simples et urgents','Aux opérations','Aux examens scolaires'],0],['Que faut-il faire pour un suivi régulier ?',['Prendre rendez-vous','Venir sans prévenir','Téléphoner à la mairie'],0]]},
    {id:'r16-08',minDay:15,title:'Immeuble plus calme',text:'Après plusieurs plaintes concernant le bruit, les habitants d’un immeuble ont décidé de fixer des horaires de calme entre 22 h et 7 h. Ils ont aussi créé un groupe de discussion pour prévenir les voisins en cas de fête exceptionnelle.',qs:[['Pourquoi les habitants ont-ils agi ?',['À cause du bruit','À cause du chauffage','À cause du loyer'],0],['Quand faut-il respecter le calme ?',['Entre 22 h et 7 h','Entre 7 h et 12 h','Uniquement le dimanche'],0],['À quoi sert le groupe de discussion ?',['À prévenir en cas de fête','À payer le loyer','À réserver un parking'],0]]},
    {id:'r16-09',minDay:19,title:'Horaires flexibles',text:'Une société a proposé à ses salariés de choisir leur heure d’arrivée entre 8 h et 10 h, à condition de travailler le nombre d’heures prévu. La direction espère ainsi réduire le stress des transports. Après trois mois, la majorité des employés souhaite conserver ce système.',qs:[['Que peuvent choisir les salariés ?',['Leur heure d’arrivée','Leur salaire','Le nombre de jours travaillés'],0],['Quel objectif vise la direction ?',['Réduire le stress des transports','Supprimer le bureau','Augmenter les réunions'],0],['Que veut la majorité après trois mois ?',['Garder le système','Revenir à une heure unique','Travailler la nuit'],0]]},
    {id:'r16-10',minDay:22,title:'Cours hybride',text:'Une université propose certains cours en format hybride : une semaine en classe, une semaine en ligne. Les étudiants apprécient la flexibilité, mais plusieurs demandent davantage de moments pour poser des questions aux enseignants.',qs:[['Comment les cours sont-ils organisés ?',['Une semaine en classe, une semaine en ligne','Toujours en ligne','Seulement le week-end'],0],['Quel avantage est apprécié ?',['La flexibilité','La réduction des examens','Le salaire'],0],['Que demandent certains étudiants ?',['Plus de temps pour poser des questions','Moins de professeurs','Des cours plus tardifs'],0]]},
    {id:'r16-11',minDay:25,title:'Réparer plutôt que jeter',text:'Dans plusieurs quartiers, des ateliers participatifs apprennent aux habitants à réparer de petits appareils. L’objectif est de réduire les déchets et d’éviter des achats inutiles. Les participants viennent avec leur objet et des bénévoles les accompagnent, mais ils doivent essayer de faire eux-mêmes la réparation.',qs:[['Quel est l’objectif principal ?',['Réduire les déchets','Vendre plus d’appareils','Remplacer les bénévoles'],0],['Que font les bénévoles ?',['Ils accompagnent les participants','Ils achètent les objets','Ils réparent tout seuls'],0],['Que doivent faire les participants ?',['Essayer de réparer eux-mêmes','Payer un abonnement annuel','Jeter leur objet'],0]]},
    {id:'r16-12',minDay:28,title:'Vacances hors saison',text:'Voyager hors saison peut permettre de payer moins cher et de visiter des lieux moins fréquentés. Cependant, certaines activités touristiques ferment plus tôt et les transports sont parfois moins nombreux. Il faut donc mieux préparer son séjour.',qs:[['Quel avantage est cité ?',['Des prix plus bas','Plus de touristes','Tous les services ouverts'],0],['Quelle limite est mentionnée ?',['Certaines activités ferment','Les hôtels sont interdits','Il n’y a jamais de transport'],0],['Quelle conséquence en tire le texte ?',['Il faut mieux préparer le séjour','Il faut toujours voyager en été','Il faut louer une voiture'],0]]},
    {id:'r16-13',minDay:31,title:'Cantines et choix végétariens',text:'De plus en plus de cantines proposent chaque jour une option végétarienne. Les responsables expliquent que cette mesure répond à la fois à une demande des familles et à des objectifs environnementaux. Certains parents craignent toutefois que les repas soient moins équilibrés ; les nutritionnistes rappellent qu’un menu végétarien bien conçu peut couvrir les besoins essentiels.',qs:[['Pourquoi les cantines proposent-elles cette option ?',['Pour répondre à une demande et à des objectifs environnementaux','Pour supprimer tous les autres plats','Pour réduire le temps du repas'],0],['Quelle inquiétude est mentionnée ?',['L’équilibre des repas','Le prix des transports','La durée des cours'],0],['Que répondent les nutritionnistes ?',['Un menu bien conçu peut être équilibré','Il faut éviter tous les légumes','Les enfants ne doivent pas choisir'],0]]},
    {id:'r16-14',minDay:35,title:'Droit à la déconnexion',text:'Certaines entreprises encouragent leurs salariés à ne pas répondre aux messages professionnels le soir et le week-end. Cette pratique vise à mieux séparer travail et vie personnelle. Elle peut toutefois être difficile à appliquer lorsque des équipes travaillent dans plusieurs pays et fuseaux horaires.',qs:[['Quel est l’objectif ?',['Mieux séparer travail et vie personnelle','Répondre plus vite la nuit','Supprimer les congés'],0],['Quand encourage-t-on à ne pas répondre ?',['Le soir et le week-end','Seulement le matin','Pendant les réunions'],0],['Quelle difficulté est évoquée ?',['Les différents fuseaux horaires','Le manque de bureaux','Le prix des ordinateurs'],0]]}
  ]);

  pushUnique(listenings,[
    {id:'l16-01',minDay:1,title:'Rendez-vous chez le coiffeur',script:'Bonjour, ici le salon Belle Coupe. Votre rendez-vous de vendredi est bien confirmé à quinze heures trente. Merci d’arriver cinq minutes avant. Si vous devez annuler, appelez-nous avant jeudi soir.',qs:[['Quand est le rendez-vous ?',['Vendredi','Jeudi','Samedi'],0],['À quelle heure ?',['15 h 30','13 h 30','17 h 30'],0],['Quand faut-il appeler pour annuler ?',['Avant jeudi soir','Après vendredi','Samedi matin'],0]]},
    {id:'l16-02',minDay:1,title:'Annonce à la bibliothèque',script:'La bibliothèque fermera exceptionnellement à dix-sept heures aujourd’hui. Les livres peuvent être rendus dans la boîte extérieure après la fermeture. Demain, les horaires habituels reprendront.',qs:[['À quelle heure ferme la bibliothèque ?',['17 h','19 h','15 h'],0],['Où peut-on rendre les livres après la fermeture ?',['Dans la boîte extérieure','À la mairie','Dans un café'],0],['Quand reprennent les horaires habituels ?',['Demain','La semaine prochaine','Ce soir'],0]]},
    {id:'l16-03',minDay:1,title:'Message d’un collègue',script:'Salut Emma, je suis déjà au bureau. La réunion commence finalement à neuf heures quinze dans la petite salle du deuxième étage. N’oublie pas d’apporter le dossier rouge.',qs:[['À quelle heure commence la réunion ?',['9 h 15','9 h','10 h 15'],0],['Où a-t-elle lieu ?',['Au deuxième étage','Au rez-de-chaussée','À l’extérieur'],0],['Que faut-il apporter ?',['Le dossier rouge','Un ordinateur neuf','Le déjeuner'],0]]},
    {id:'l16-04',minDay:3,title:'Changement de bus',script:'En raison de travaux, la ligne douze ne passe pas par la place centrale aujourd’hui. Les voyageurs doivent descendre à l’arrêt République et prendre la ligne huit pour continuer vers l’université.',qs:[['Pourquoi la ligne change-t-elle ?',['À cause de travaux','À cause d’un concert','À cause de la neige'],0],['Où faut-il descendre ?',['République','Université','Gare'],0],['Quelle ligne faut-il ensuite prendre ?',['La ligne 8','La ligne 12','La ligne 18'],0]]},
    {id:'l16-05',minDay:5,title:'Réservation de restaurant',script:'Bonsoir. Je confirme votre réservation pour quatre personnes samedi à vingt heures. Nous avons noté qu’une personne ne mange pas de viande. Si vous arrivez avec plus de quinze minutes de retard, merci de nous prévenir.',qs:[['Pour combien de personnes ?',['Quatre','Deux','Six'],0],['Quelle information alimentaire est donnée ?',['Une personne ne mange pas de viande','Tout le monde est végétarien','Une personne est allergique au lait'],0],['Quand faut-il prévenir le restaurant ?',['En cas de retard de plus de 15 minutes','Pour arriver en avance','Après le repas'],0]]},
    {id:'l16-06',minDay:8,title:'Problème à l’hôtel',script:'Bonjour, je suis dans la chambre deux cent douze. Depuis hier soir, le chauffage ne fonctionne plus et il fait très froid. Est-ce que quelqu’un pourrait venir vérifier aujourd’hui, s’il vous plaît ?',qs:[['Quel est le problème ?',['Le chauffage','La télévision','La douche'],0],['Depuis quand ?',['Depuis hier soir','Depuis une semaine','Depuis ce matin uniquement'],0],['Que demande la personne ?',['Une vérification aujourd’hui','Un remboursement immédiat','Un taxi'],0]]},
    {id:'l16-07',minDay:12,title:'Conseil médical',script:'Si votre douleur continue plus de trois jours ou si vous avez de la fièvre, prenez rendez-vous avec votre médecin. En attendant, reposez-vous et buvez suffisamment d’eau. Évitez le sport intense.',qs:[['Quand faut-il consulter ?',['Si la douleur dure plus de trois jours ou en cas de fièvre','Immédiatement dans tous les cas','Seulement après un mois'],0],['Que faut-il faire en attendant ?',['Se reposer et boire de l’eau','Faire du sport intense','Ne rien boire'],0],['Que faut-il éviter ?',['Le sport intense','Le sommeil','Les repas'],0]]},
    {id:'l16-08',minDay:15,title:'Voisinage',script:'Bonjour, je voulais vous prévenir que nous fêtons un anniversaire samedi soir. Nous ferons attention au bruit et nous arrêterons la musique vers vingt-trois heures trente. Si cela vous dérange, n’hésitez pas à venir nous voir.',qs:[['Quel événement est prévu ?',['Un anniversaire','Un déménagement','Une réunion de travail'],0],['Vers quelle heure la musique s’arrêtera-t-elle ?',['23 h 30','22 h','1 h 30'],0],['Que propose la personne aux voisins ?',['De venir parler si nécessaire','D’appeler la police directement','De quitter l’immeuble'],0]]},
    {id:'l16-09',minDay:19,title:'Organisation du travail',script:'Depuis janvier, notre équipe peut commencer entre huit et dix heures. Personnellement, je viens vers huit heures trente parce que le métro est moins chargé et que je peux partir plus tôt. Je trouve ce système vraiment pratique.',qs:[['Quelle flexibilité existe ?',['Choisir son heure d’arrivée entre 8 h et 10 h','Travailler seulement le matin','Ne jamais venir au bureau'],0],['Pourquoi la personne vient-elle à 8 h 30 ?',['Le métro est moins chargé et elle peut partir plus tôt','Elle déteste le matin','Le bureau ferme à 9 h'],0],['Quel est son avis ?',['Le système est pratique','Le système est inutile','Elle veut le supprimer'],0]]},
    {id:'l16-10',minDay:22,title:'Cours en ligne',script:'J’aime suivre certains cours en ligne parce que je peux revoir les explications. En revanche, quand le sujet est difficile, je préfère être en classe pour poser des questions immédiatement. Pour moi, le meilleur système combine les deux.',qs:[['Quel avantage des cours en ligne est cité ?',['Revoir les explications','Finir sans travailler','Éviter tous les examens'],0],['Quand la personne préfère-t-elle la classe ?',['Quand le sujet est difficile','Quand elle veut dormir','Quand le cours est court'],0],['Quel système préfère-t-elle ?',['Un mélange des deux','Uniquement en ligne','Uniquement des livres'],0]]},
    {id:'l16-11',minDay:25,title:'Atelier de réparation',script:'Ce samedi, la maison de quartier organise un atelier gratuit pour réparer de petits appareils. Apportez votre objet entre dix heures et midi. Des bénévoles vous montreront comment identifier la panne et remplacer une pièce simple.',qs:[['Quand peut-on apporter son objet ?',['Entre 10 h et 12 h','Après 18 h','Vendredi soir'],0],['Combien coûte l’atelier ?',['Il est gratuit','20 euros','5 euros par minute'],0],['Que feront les bénévoles ?',['Montrer comment identifier et réparer une panne simple','Acheter de nouveaux appareils','Réparer sans expliquer'],0]]},
    {id:'l16-12',minDay:28,title:'Voyager autrement',script:'Depuis quelques années, je pars plutôt en septembre qu’en juillet. Il y a moins de monde et les hébergements sont souvent moins chers. Le seul problème, c’est que certains musées ferment plus tôt.',qs:[['Quand la personne préfère-t-elle voyager ?',['En septembre','En juillet uniquement','En décembre'],0],['Quels avantages cite-t-elle ?',['Moins de monde et des prix plus bas','Plus de chaleur et plus de monde','Des musées ouverts toute la nuit'],0],['Quelle limite mentionne-t-elle ?',['Certains musées ferment plus tôt','Les trains sont interdits','Les hôtels n’existent pas'],0]]},
    {id:'l16-13',minDay:31,title:'Débat sur la cantine',script:'Une mère explique qu’elle est favorable à un menu végétarien quotidien à la cantine, à condition qu’il reste un choix. Selon elle, les enfants peuvent découvrir d’autres aliments, mais il faut aussi informer les familles sur l’équilibre nutritionnel.',qs:[['Quelle est sa position ?',['Favorable, à condition de garder un choix','Totalement opposée','Elle veut supprimer la cantine'],0],['Quel avantage cite-t-elle ?',['Découvrir d’autres aliments','Manger plus vite','Payer moins de transports'],0],['Quelle condition ajoute-t-elle ?',['Informer les familles','Interdire les légumes','Servir le même repas partout'],0]]},
    {id:'l16-14',minDay:35,title:'Vie professionnelle et messages',script:'Un responsable rappelle que répondre aux messages tard le soir ne doit pas devenir une obligation. Il conseille de programmer l’envoi des courriels non urgents pour le lendemain matin et de préciser clairement lorsqu’une demande est réellement urgente.',qs:[['Que ne faut-il pas transformer en obligation ?',['Répondre tard le soir','Lire le matin','Planifier les réunions'],0],['Que conseille-t-il pour les courriels non urgents ?',['Programmer leur envoi pour le lendemain','Les supprimer','Les envoyer à minuit'],0],['Que faut-il préciser ?',['Si une demande est réellement urgente','Le salaire de chacun','Le nombre de bureaux'],0]]}
  ]);

  pushUnique(writings,[
    {id:'w16-01',minDay:1,title:'Message à un nouveau camarade',min:60,prompt:'Écrivez à un nouveau camarade de cours. Présentez-vous, dites quand vous êtes disponible et proposez de réviser ensemble.',check:['présent','présentation','disponibilité','proposition','≥60 mots']},
    {id:'w16-02',minDay:1,title:'Informations pour une activité',min:70,prompt:'Écrivez à un club sportif pour demander les horaires, le prix, le matériel nécessaire et la possibilité de faire un cours d’essai.',check:['politesse','4 informations demandées','questions','fin de message','≥70 mots']},
    {id:'w16-03',minDay:5,title:'Un petit problème au restaurant',min:80,prompt:'Racontez un problème récent au restaurant et expliquez comment il a été résolu.',check:['passé composé','chronologie','problème','solution','≥80 mots']},
    {id:'w16-04',minDay:8,title:'Un voyage avec une surprise',min:100,prompt:'Racontez un trajet ou un voyage où quelque chose d’imprévu s’est produit. Décrivez le contexte puis l’événement et la solution.',check:['imparfait','passé composé','connecteurs temporels','solution','≥100 mots']},
    {id:'w16-05',minDay:12,title:'Demander un rendez-vous',min:110,prompt:'Écrivez à un cabinet médical : expliquez brièvement votre problème, depuis quand il dure, vos disponibilités et demandez un rendez-vous.',check:['depuis','demande claire','disponibilités','politesse','≥110 mots']},
    {id:'w16-06',minDay:15,title:'Conseils pour mieux apprendre',min:120,prompt:'Un ami veut progresser en français mais ne sait pas comment travailler. Donnez-lui quatre conseils et justifiez-les.',check:['conditionnel','4 conseils','justifications','connecteurs','≥120 mots']},
    {id:'w16-07',minDay:19,title:'Proposer une organisation',min:130,prompt:'Écrivez à votre équipe pour proposer une nouvelle organisation des réunions. Présentez le problème actuel, votre proposition et deux avantages.',check:['problème','proposition','2 avantages','registre adapté','≥130 mots']},
    {id:'w16-08',minDay:22,title:'Cours hybride : votre avis',min:140,prompt:'Votre école veut alterner cours en classe et cours en ligne. Donnez votre avis, deux avantages ou limites et un exemple personnel.',check:['opinion','2 arguments','exemple','nuance','≥140 mots']},
    {id:'w16-09',minDay:25,title:'Réclamation livraison',min:150,prompt:'Votre commande est arrivée très en retard et un produit est abîmé. Écrivez au service client : faits, conséquences et solution souhaitée.',check:['faits précis','conséquences','demande','politesse','≥150 mots']},
    {id:'w16-10',minDay:28,title:'Voyager hors saison',min:150,prompt:'Un blog demande si voyager hors saison est une bonne idée. Présentez des avantages, une limite, un exemple et votre position.',check:['opinion','avantages','limite','exemple','conclusion','≥150 mots']},
    {id:'w16-11',minDay:31,title:'DELF · Activités dans le quartier',min:160,prompt:'La mairie demande des idées pour améliorer la vie du quartier. Écrivez un texte proposant une activité régulière, son organisation, ses avantages et les difficultés possibles.',check:['situation','proposition','organisation','avantages','nuance','≥160 mots']},
    {id:'w16-12',minDay:31,title:'DELF · Droit à la déconnexion',min:160,prompt:'Un forum professionnel demande : « Faut-il éviter les messages de travail le soir ? » Donnez votre opinion, deux arguments, un exemple, une objection et une conclusion.',check:['opinion','2 arguments','exemple','objection/nuance','conclusion','≥160 mots']}
  ]);

  pushUnique(speakings,[
    {id:'s16-01',minDay:1,part:'Fondation',title:'Mon logement et mon quartier',prompt:'Parlez 60 à 75 secondes : où vous habitez, ce qu’il y a près de chez vous, ce que vous aimez et une chose que vous voudriez changer.',target:75,check:['présent','il y a','opinion simple','4 informations']},
    {id:'s16-02',minDay:1,part:'Interaction guidée',title:'S’inscrire à une activité',prompt:'Vous voulez essayer un cours de sport. Posez au moins quatre questions : jour, heure, prix, matériel et inscription.',target:75,check:['4 questions','politesse','réaction courte']},
    {id:'s16-03',minDay:3,part:'Interaction guidée',title:'Changer un rendez-vous',prompt:'Vous ne pouvez pas venir à l’heure prévue. Expliquez brièvement et proposez deux autres possibilités.',target:90,check:['négation','heure/date','2 propositions','politesse']},
    {id:'s16-04',minDay:5,part:'Récit',title:'Un problème récent',prompt:'Racontez un petit problème récent : où vous étiez, ce qui s’est passé et comment vous avez réagi.',target:90,check:['passé composé','ordre','réaction']},
    {id:'s16-05',minDay:8,part:'Récit développé',title:'Une journée qui ne s’est pas passée comme prévu',prompt:'Parlez environ deux minutes : contexte, événement imprévu, conséquence et solution.',target:120,check:['imparfait','passé composé','conséquence','solution']},
    {id:'s16-06',minDay:12,part:'Conseil',title:'Aider quelqu’un de stressé',prompt:'Un ami est stressé avant un examen. Donnez au moins quatre conseils et expliquez pourquoi.',target:120,check:['conditionnel','4 conseils','justifications','connecteurs']},
    {id:'s16-07',minDay:15,part:'Interaction',title:'Réparation dans le logement',prompt:'Votre chauffage ne fonctionne plus. Appelez le propriétaire, expliquez le problème, réagissez à une proposition tardive et demandez une solution plus rapide.',target:150,check:['problème','depuis','réaction','négociation']},
    {id:'s16-08',minDay:19,part:'Interaction',title:'Organisation du travail',prompt:'Demandez à modifier vos horaires pendant une semaine. Justifiez, répondez à une objection et proposez un compromis.',target:150,check:['demande','justification','objection','compromis']},
    {id:'s16-09',minDay:22,part:'Point de vue guidé',title:'Cours en ligne ou en classe',prompt:'Donnez votre préférence, deux raisons, un exemple personnel et reconnaissez un avantage de l’autre option.',target:180,check:['opinion','2 arguments','exemple','nuance']},
    {id:'s16-10',minDay:25,part:'Interaction',title:'Service client',prompt:'Une livraison a beaucoup de retard. Demandez des explications, refusez une réponse vague et obtenez une solution précise.',target:180,check:['faits','relance','refus poli','solution']},
    {id:'s16-11',minDay:28,part:'Point de vue',title:'Voyager hors saison',prompt:'Expliquez si vous préférez voyager en haute ou basse saison. Présentez deux avantages, une limite, un exemple et votre conclusion.',target:180,check:['comparaison','2 arguments','limite','conclusion']},
    {id:'s16-12',minDay:31,part:'Entretien dirigé',title:'Parcours et projets',prompt:'Répondez pendant 2 à 3 minutes comme à l’entretien DELF : situation actuelle, apprentissage du français, expérience récente et projet pour l’année prochaine.',target:150,check:['présent','passé','futur','développement']},
    {id:'s16-13',minDay:31,part:'Point de vue',title:'Messages professionnels le soir',prompt:'Faut-il limiter les messages professionnels en dehors des horaires de travail ? Construisez un point de vue de 3 minutes avec arguments, exemple, nuance et conclusion.',target:180,check:['opinion','arguments','exemple','nuance','conclusion']}
  ]);

  const GUIDES={
    present:{goal:'Automatiser les verbes les plus fréquents et construire une phrase simple sans traduire mot à mot.',rules:['Sujet + verbe conjugué + complément.','Être/avoir/aller/faire doivent devenir automatiques.','Avec on, le verbe se conjugue comme il/elle.'],traps:['Oublier le sujet devant le verbe.','Employer l’infinitif après le sujet : je aller ✗.'],drills:['Transformer je → nous → ils.','Dire 6 phrases sur aujourd’hui sans lire.']},
    negation:{goal:'Savoir refuser, corriger et signaler une absence ou une limite.',rules:['ne/n’ + verbe + pas/jamais/plus/rien/personne.','Après pas, un partitif devient souvent de.'],traps:['Mettre pas avant le verbe.','Cumuler pas avec jamais/personne sans raison.'],drills:['Transformer 5 phrases affirmatives.','Dire 5 choses que vous ne faites jamais/plus.']},
    questions:{goal:'Poser rapidement des questions utiles en interaction DELF.',rules:['Est-ce que + phrase affirmative.','Mot interrogatif : où, quand, pourquoi, comment, combien de.'],traps:['Oublier de après combien.','Mélanger inversion et est-ce que.'],drills:['Créer 6 questions à partir d’une annonce.','Faire une mini-interview de 60 secondes.']},
    pc:{goal:'Raconter des événements terminés avec un ordre clair.',rules:['avoir/être au présent + participe passé.','Avec être, le participe s’accorde avec le sujet.'],traps:['Choisir avoir avec aller/venir/partir.','Utiliser l’imparfait pour une action unique terminée.'],drills:['Raconter hier en 6 actions.','Transformer un journal au présent en passé.']},
    imparfait:{goal:'Installer le décor, une habitude ou un état dans un récit.',rules:['Radical de nous au présent sans -ons + ais/ais/ait/ions/iez/aient.','Être : ét-.'],traps:['Employer l’imparfait pour l’événement qui coupe une action.'],drills:['Décrire votre enfance en 5 phrases.','Décrire météo, lieu, personnes avant un événement.']},
    pcimp:{goal:'Combiner contexte et événement, compétence centrale du récit B1.',rules:['Imparfait = cadre / durée / habitude.','Passé composé = événement borné / changement.'],traps:['Choisir le temps seulement à cause d’un mot comme hier.'],drills:['Créer 5 paires “je faisais… quand…”.','Raconter un incident en 90 secondes.']},
    conditionnel:{goal:'Demander, conseiller et négocier avec plus de politesse.',rules:['Radical du futur + terminaisons de l’imparfait.','voudrais / pourrais / devriez / serait sont très rentables.'],traps:['Ajouter de avant l’infinitif.'],drills:['Formuler 5 demandes directes puis polies.','Donner 4 conseils avec justification.']},
    connectors:{goal:'Passer de phrases isolées à un discours organisé.',rules:['Cause : parce que / puisque.','Conséquence : donc / c’est pourquoi.','Opposition : cependant / pourtant / en revanche.'],traps:['Empiler des connecteurs sans relation logique.'],drills:['Faire un argument en 5 étapes.','Reformuler le même avis avec 4 connecteurs différents.']},
    opinion:{goal:'Construire un point de vue B1 : position, raison, exemple, nuance, conclusion.',rules:['Annoncez votre position tôt.','Un argument doit être expliqué puis illustré.','Reconnaître une limite rend le discours plus crédible.'],traps:['Faire une liste sans expliquer.','Conclure avec une idée nouvelle.'],drills:['Parler 2 minutes sur un sujet quotidien.','Écrire un plan en 5 lignes avant de rédiger.']}
  };
  function guideFor(g){return GUIDES[g.id]||{goal:`Utiliser ${g.name} sans hésitation dans une tâche réelle.`,rules:[g.use],traps:['Ne pas se limiter à reconnaître la bonne réponse : produire vos propres phrases.'],drills:[`Créer 5 phrases avec ${g.name}.`,`Réutiliser ${g.name} dans une réponse orale de 60 secondes.`]}}

  const oldToday=today;
  today=function(){
    let html=oldToday();
    html=html.replace(/5小时：语法5题、听力1组、阅读1篇、写作1项、口语1轮、应用1项。6\.5小时：语法8题、听力2组、阅读2篇、写作1项、口语2轮、应用2项。8小时：语法10题、听力3组、阅读3篇、写作2项、口语3轮、应用3项。/,
      '5小时：语法8题 + 6个主动产出、听力2组、阅读2篇、写作1项、口语2轮、应用2项。6.5小时：语法10题 + 8个主动产出、听力3组、阅读3篇、写作1项、口语3轮、应用3项。8小时：语法12题 + 10个主动产出、听力4组、阅读4篇、写作2项、口语4轮、应用4项。');
    const stage=S.selectedDay<=18?'基础与自动化':S.selectedDay<=30?'应用迁移':S.selectedDay<=40?'DELF专项':'模考修复';
    return html+`<div class="card"><div class="row wrap"><div><b>V1.6 内容深度 · ${stage}</b><div class="muted">当前可用：阅读 ${available(readings).length} 篇 · 听力 ${available(listenings).length} 组 · 写作 ${available(writings).length} 项 · 口语 ${available(speakings).length} 项 · 应用 ${available(applications).length} 项。</div></div><span class="pill blue">内容池已扩充</span></div><div class="callout blue" style="margin-top:10px">高强度档增加的是同阶段的不同材料、主动产出与复盘，不会通过提前引入后续语法来“凑时间”。</div></div>`;
  };

  const oldGrammar=grammar;
  grammar=function(){
    const g=GRAMMAR[UI.gNode],guide=guideFor(g),qs=grammarQuestions(g);
    return oldGrammar()+`<div class="card"><div class="row wrap"><div><b>知识讲解 · ${g.name}</b><div class="muted">当前节点共有 ${qs.length} 道客观题；客观题之后必须进入主动产出。</div></div><span class="pill">理解 → 控制 → 应用</span></div><h3>本节点目标</h3><div class="callout good">${guide.goal}</div><div class="grid2" style="margin-top:10px"><div><b>核心规则</b>${guide.rules.map(x=>`<div class="node">• ${x}</div>`).join('')}</div><div><b>高频陷阱</b>${guide.traps.map(x=>`<div class="node">• ${x}</div>`).join('')}</div></div><div class="divider"></div><b>离开选择题后的练法</b>${guide.drills.map((x,i)=>`<div class="node"><span class="pill">${i+1}</span>${x}</div>`).join('')}</div>`;
  };

  const oldReadingView=readingView;
  readingView=function(r){return oldReadingView(r)+`<div class="card"><b>阅读复盘 · 做完客观题后再花 8–12 分钟</b><div class="node">1. 不看原文，用法语写 2 句主旨。</div><div class="node">2. 找出 5 个可复用词块，不抄孤立单词。</div><div class="node">3. 任选一个信息，改写成自己的句子。</div><div class="node">4. Day 19+：补一句作者态度或文本目的。</div></div>`};
  const oldListeningView=listeningView;
  listeningView=function(l){return oldListeningView(l)+`<div class="card"><b>听力复盘 · 三遍法</b><div class="node">第一遍：只记人物、地点、主题。</div><div class="node">第二遍：记数字、时间、原因、变化。</div><div class="node">第三遍：对照文本，标出你“听见但没理解”和“完全没听见”的部分。</div><div class="callout warn">训练目标不是无限重复播放。两遍后先作答，第三遍用于诊断。</div></div>`};
  const oldWritingView=writingView;
  writingView=function(){const w=currentWriting();return oldWritingView()+`<div class="card"><b>写作支架</b><div class="grid2"><div><span class="pill">计划 5–10 min</span><div class="node">任务对象是谁？我要完成哪 2–4 个功能？</div><div class="node">先写关键词，不先写完整句。</div></div><div><span class="pill">检查 5 min</span><div class="node">动词时态和主谓一致</div><div class="node">冠词 / 阴阳性 / 复数</div><div class="node">至少 3 个逻辑连接</div></div></div><div class="callout blue">本题最低 ${w.min} 词只是任务门槛，不代表写作达到 B1。Day 31+ 才以 ≥160 词正式模拟为主。</div></div>`};
  const oldSpeakingView=speakingView;
  speakingView=function(){const p=currentSpeaking();return oldSpeakingView()+`<div class="card"><b>口语回听证据（不换算能力百分比）</b><div class="grid2"><div><div class="node">□ 是否完成题目要求的所有信息点</div><div class="node">□ 是否出现明显长停顿导致句子中断</div><div class="node">□ 是否使用今天的语法/句块</div></div><div><div class="node">□ 是否有理由或例子，而不是只给结论</div><div class="node">□ 是否达到目标时长约 ${fmtSec(p.target)}</div><div class="node">□ 回听后能指出 1 个下次要修的问题</div></div></div><div class="callout warn">目前只记录训练证据、时长和完成次数。没有可靠法语语音识别与 DELF 评分器前，不生成口语“水平百分比”。</div></div>`};
  const oldApplicationView=applicationView;
  applicationView=function(){return oldApplicationView()+`<div class="card"><b>应用迁移要求</b><div class="node">第一轮：允许看建议句块完成。</div><div class="node">第二轮：关闭句块，不看文字口头重做。</div><div class="node">第三轮（6.5/8小时档）：改变一个条件，例如时间、价格、对方态度，再做一次。</div></div>`};

  const v16Top=function(title,sub){return `<div class="top"><div><div class="eyebrow">DELF50 · WEB V${V16}</div><h1>${title}</h1><div class="muted">${sub}</div></div><span class="pill">交互已启动</span></div>`};
  if(typeof pageTop!=='undefined') pageTop=v16Top; else top=v16Top;
  ;save();render();
})();
