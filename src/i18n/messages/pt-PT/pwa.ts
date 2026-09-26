/**
 * PWA: update, offline, installation and notification permission.
 * `install.steps.<platform>` and `notifications.reenable.<platform>` are keyed by InstallPlatform
 * (ios | android | desktop | other); `notifications.states.<state>` by NotificationPermissionState.
 */
export default {
  update: {
    title: 'Nova versão disponível',
    body: 'Atualiza para usares a versão mais recente da app.',
    action: 'Atualizar',
    later: 'Mais tarde',
  },
  offlineReady: {
    title: 'Pronta para usar offline',
    body: 'A app abre mesmo sem ligação. A tradução, a conversa com IA e a meteorologia precisam de internet.',
  },
  install: {
    title: 'Instalar a app',
    body: 'Adiciona o Erasmus Help ao ecrã principal: abre mais depressa, em ecrã inteiro, e funciona mesmo sem ligação.',
    action: 'Instalar',
    installed: 'A app está instalada neste dispositivo.',
    steps: {
      ios: {
        title: 'Instalar no iPhone ou iPad',
        step1: 'Abre esta página no Safari.',
        step2: 'Toca em Partilhar (o quadrado com uma seta para cima).',
        step3: 'Escolhe «Adicionar ao ecrã principal» e confirma em «Adicionar».',
      },
      android: {
        title: 'Instalar no Android',
        step1: 'Abre esta página no Chrome.',
        step2: 'Toca no menu ⋮, no canto superior direito.',
        step3: 'Escolhe «Instalar app» (ou «Adicionar ao ecrã principal») e confirma.',
      },
      desktop: {
        title: 'Instalar no computador',
        step1: 'Abre esta página no Chrome ou no Edge.',
        step2: 'Clica no ícone de instalar, na barra de endereço.',
        step3: 'Confirma em «Instalar».',
      },
      other: {
        title: 'Instalar a app',
        step1: 'Abre o menu do teu browser.',
        step2: 'Escolhe «Instalar app» ou «Adicionar ao ecrã principal».',
        step3: 'Confirma a instalação.',
      },
    },
    safariMac: 'No Safari (Mac): Ficheiro → Adicionar à Dock.',
  },
  notifications: {
    title: 'Notificações',
    ask: {
      title: 'Queres receber notificações?',
      body: 'Avisamos-te de novidades importantes da app, mesmo com ela fechada. Podes mudar isto quando quiseres nas Definições.',
      hint: 'O teu browser vai pedir-te autorização.',
      allow: 'Ativar notificações',
      decline: 'Agora não',
    },
    states: {
      granted: {
        title: 'Notificações ativadas',
        body: 'Este dispositivo pode receber notificações do Erasmus Help.',
      },
      default: {
        title: 'Notificações desativadas',
        body: 'Ainda não autorizaste as notificações neste dispositivo.',
      },
      denied: {
        title: 'Notificações bloqueadas',
        body: 'As notificações estão bloqueadas para esta app. Só as podes voltar a ativar nas definições do browser ou do sistema.',
      },
      unsupported: {
        title: 'Notificações indisponíveis',
        body: 'Este browser não suporta notificações.',
      },
    },
    iosInstallRequired:
      'No iPhone e no iPad, as notificações só funcionam com a app adicionada ao ecrã principal (iOS 16.4 ou superior).',
    pushUnavailable: 'O envio de notificações ainda não está ativo nesta versão da app.',
    reenable: {
      title: 'Como voltar a ativar',
      ios: 'iPhone/iPad: Definições → Notificações → Erasmus Help → ativa «Permitir notificações».',
      android:
        'Android: no Chrome, toca no ícone à esquerda do endereço → Permissões → Notificações → Permitir. Com a app instalada: mantém o ícone premido → Informações da app → Notificações.',
      desktop:
        'Computador: clica no ícone à esquerda do endereço → Definições do site → Notificações → Permitir, e recarrega a página.',
      other: 'Abre as definições deste site no teu browser e permite as notificações.',
    },
  },
}
