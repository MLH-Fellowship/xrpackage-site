import screenshotEngine from './screenshotEngine.js';
import {handleUrl} from './utils.js';
import {
  worldSaveButton, worldRevertButton, sandboxButton, newWorldButton,
  runMode, editMode,
} from './domElements.js';

const apiHost = 'https://ipfs.exokit.org/ipfs';
const worldsEndpoint = 'https://worlds.exokit.org';
let currentWorldId = '';
let currentWorldChanged = false;

const _pushWorld = (name, pe) => {
  history.pushState({}, '', window.location.protocol + '//' + window.location.host + window.location.pathname + (name ? ('?w=' + name) : ''));
  handleUrl(window.location.href, pe);
};

const _makeId = length => {
  let result = '';
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

const _makeWorldHtml = w => `
  <div class="world ${currentWorldId === w.id ? 'open' : ''}" worldId="${w.id}">
    <img src=assets/question.png>
    <div class="text">
      <input type=text class=name-input value="${w.name}" disabled>
    </div>
    <div class=background>
      <nav class="button rename-button">Rename</nav>
    </div>
  </div>
`;

const _bindWorld = (w, pe) => {
  w.addEventListener('click', async e => {
    const worldId = w.getAttribute('worldId');
    if (worldId !== currentWorldId) {
      _pushWorld(worldId, pe);
    }
  });
  const nameInput = w.querySelector('.name-input');
  const renameButton = w.querySelector('.rename-button');
  let oldValue = '';
  renameButton.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();

    w.classList.add('renaming');
    oldValue = nameInput.value;
    nameInput.removeAttribute('disabled');
    nameInput.select();
  });
  nameInput.addEventListener('blur', e => {
    nameInput.value = oldValue;
    nameInput.setAttribute('disabled', '');
    oldValue = '';
  });
  nameInput.addEventListener('keydown', e => {
    if (e.which === 13) { // enter
      pe.name = nameInput.value;
      currentWorldChanged = true;
      updateWorldSaveButton();

      oldValue = nameInput.value;
      nameInput.blur();
    } else if (e.which === 27) { // esc
      nameInput.blur();
    }
  });
};

const updateWorldSaveButton = (worldChanged) => {
  currentWorldChanged = worldChanged;
  if (currentWorldChanged && currentWorldId) {
    worldSaveButton.classList.remove('hidden');
    worldRevertButton.classList.remove('hidden');
  } else {
    worldSaveButton.classList.add('hidden');
    worldRevertButton.classList.add('hidden');
  }
};

const enterWorld = async (worldId, pe) => {
  currentWorldId = worldId;

  const headerLabel = document.getElementById('header-label');
  headerLabel.innerText = name || 'Sandbox';
  runMode.setAttribute('href', 'run.html' + (worldId ? ('?w=' + worldId) : ''));
  editMode.setAttribute('href', 'edit.html' + (worldId ? ('?w=' + worldId) : ''));

  const worlds = Array.from(document.querySelectorAll('.world'));
  worlds.forEach(world => world.classList.remove('open'));

  let world;
  if (worldId) {
    world = worlds.find(w => w.getAttribute('worldId') === worldId);
  } else {
    world = worlds[0];
  }
  world && world.classList.add('open');

  if (worldId) {
    const res = await fetch(worldsEndpoint + '/' + worldId);
    if (res.ok) {
      const j = await res.json();
      const {hash} = j;
      await pe.downloadScene(hash);
    } else {
      console.warn('invalid world status code: ' + worldId + ' ' + res.status);
    }
  } else {
    pe.reset();
  }

  currentWorldChanged = false;
  updateWorldSaveButton();
};

function worldHandlers(pe) {
  worldSaveButton.addEventListener('click', async e => {
    const {name} = pe;
    const hash = await pe.uploadScene();

    const screenshotBlob = await screenshotEngine(pe);
    const {hash: previewIconHash} = await fetch(`${apiHost}/`, {
      method: 'PUT',
      body: screenshotBlob,
    })
      .then(res => res.json());

    const objects = await Promise.all(pe.children.map(async p => {
      const {name} = p;
      const previewIconHash = await (async () => {
        const screenshotImgUrl = await p.getScreenshotImageUrl();
        if (screenshotImgUrl) {
          const screenshotBlob = await fetch(screenshotImgUrl)
            .then(res => res.blob());
          const {hash: previewIconHash} = await fetch(`${apiHost}/`, {
            method: 'PUT',
            body: screenshotBlob,
          })
            .then(res => res.json());
          return previewIconHash;
        } else {
          return null;
        }
      })();
      return {
        name,
        previewIconHash,
      };
    }));

    const w = {
      id: currentWorldId,
      name,
      description: 'This is a world description',
      hash,
      previewIconHash,
      objects,
    };

    const res = await fetch(worldsEndpoint + '/' + currentWorldId, {
      method: 'PUT',
      body: JSON.stringify(w),
    });

    if (res.ok) {
      // nothing
    } else {
      console.warn('invalid status code: ' + res.status);
    }

    currentWorldChanged = false;
    updateWorldSaveButton();
  });

  worldRevertButton.addEventListener('click', async e => {
    enterWorld(currentWorldId, pe);
  });

  sandboxButton.addEventListener('click', e => {
    _pushWorld(null, pe);
  });

  const worlds = document.getElementById('worlds');
  newWorldButton.addEventListener('click', async e => {
    pe.reset();
    const hash = await pe.uploadScene();

    const worldId = _makeId(8);
    const w = {
      id: worldId,
      name: worldId,
      description: 'This is a world description',
      hash,
      objects: [],
    };

    const res = await fetch(worldsEndpoint + '/' + w.name, {
      method: 'PUT',
      body: JSON.stringify(w),
    });

    if (res.ok) {
      worlds.innerHTML += '\n' + _makeWorldHtml(w);
      const ws = Array.from(worlds.querySelectorAll('.world'));
      Array.from(worlds.querySelectorAll('.world')).forEach(w => _bindWorld(w, pe));
      const newW = ws[ws.length - 1];
      newW.click();
    } else {
      console.warn('invalid status code: ' + res.status);
    }
  });

  (async () => {
    const res = await fetch(worldsEndpoint);
    const children = await res.json();
    const ws = await Promise.all(children.map(child =>
      fetch(worldsEndpoint + '/' + child)
        .then(res => res.json()),
    ));
    worlds.innerHTML = ws.map(w => _makeWorldHtml(w)).join('\n');
    Array.from(worlds.querySelectorAll('.world')).forEach((w, i) => _bindWorld(w, pe));
  })();
}

export {updateWorldSaveButton, worldHandlers, enterWorld};
