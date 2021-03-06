export const { createApp, createComponent } = (() => {
  const mapObject = (obj, fn, defacc = {}) => Object.entries(obj || {}).reduce((acc, [key, value]) => {
    const [newValue, newKey] = fn(value, key) || [];
    acc[newKey ?? key] = newValue;
    return acc;
  }, defacc);
  const createState = (state, isDebug = false) => {
    const prototype = {
      get() { return this.value },
      set(value) { Object.values(this.callbacks).forEach(x => x(this.value = value)) },
      watch(fn, id) { this.callbacks[id] = fn },
      unwatch(id) { delete this.callbacks[id] }
    };
    const result = mapObject(state, (value, name) => [Object.assign(Object.create(prototype), { value, name, callbacks: {} })]);
    if (isDebug) window.__STATE__ = result;
    return result;
  };
  const cash = {};
  const createComponent = (getOptions, stateMappers) => (props = {}) =>
    function update ({ parentKey, state, isDeleting = false, isDebug, i}) {
      const key = `${parentKey}:${props.key || i}`;
      // self
      const reUpdate =  (isDeleting = false) => update({ parentKey, state, isDeleting, isDebug, i });
      const self = cash[key] ? cash[key] : {
        el: null,
        key,
        events: {},
        children: {},
        oldStyles: {},
        oldAttrs: {},
        stateProps: [],
        isMounted: false,
        isDeleting: false,
        deleteTimeout: 0,
        data: {},
        onDelete: () => reUpdate(true),
        update: () => setTimeout(() => reUpdate(false), 0) 
      }
      cash[key] = self;
      self.isDeleting = isDeleting;
      // stateProps
      const { props: stateProps = [], actions = {} } = stateMappers || {};
      (self.stateProps).map(name => state[name].unwatch(key)); // TODO колбеки могут продолжать храниться после удаления компонента
      self.stateProps = stateProps;
      const statePropsMap = mapObject(stateProps, (name) => {
        state[name].watch(() => update({ parentKey, state, isDebug }), key);
        return [state[name].get(), name]
      } )
      const stateActionsMap = mapObject(actions, ([prop, fn], name) => 
        [(...args) => state[prop].set(fn(state[prop].get())(...args))]
      );
      // newOptions
      let {
        tag = 'div', events = {}, attrs = {}, children = [], styles = {},
      } = getOptions(props, { ...statePropsMap, ...stateActionsMap }, self);
      if (!Array.isArray(children)) {
        attrs = Object.assign(attrs || {}, { textContent: String(children) });
        children = [];
      }
      // el
      const el = self.el = self.el ?.tagName.toLowerCase() === tag ? self.el : document.createElement(tag);
      if (isDebug) Object.assign(el.dataset, { key: props.key || i });
      // styles
      const oldStyles = mapObject(styles, (_, name) => [self.oldStyles[name] ?? el.style[name]])
      Object.assign(el.style, self.oldStyles, styles);
      self.oldStyles = oldStyles;
      // attrs
      const oldAttrs = mapObject(attrs, (_, name) => [self.oldAttrs[name] ?? el[name]])
      Object.assign(el, self.oldAttrs, attrs);
      self.oldAttrs = oldAttrs;
      // events
      Object.entries(self.events).forEach(([name, fn]) => el.removeEventListener(name, fn));
      Object.entries(events).map(([name, fn]) => el.addEventListener(name, fn));
      self.events = events;
      // children
      let prevKey = null;
      const newChildren = mapObject(children, (childUpdate, i) => {
        const child = childUpdate({ parentKey: key, prevKey, state, isDebug, i });
        if ((self.children[child.key]?.prevKey !== prevKey)) el.appendChild(child.el);
        child.isMounted = true;
        child.prevKey = prevKey;
        prevKey = child.key;
        return [child, child.key];
      });
      Object.entries(self.children).forEach(([key, child]) => {
        if (!(key in newChildren)) {
          if (child.deleteTimeout) {
            child.onDelete();
            delete cash[key];
            setTimeout(() => child.el.remove(), child.deleteTimeout);
          } else {
            delete cash[key];
            child.el.remove();
          }
        }
      });
      self.children = mapObject(newChildren, (child) => [child, child.key]);
      return self
    }
  
  const createApp = ({ component, element, state = {}, isDebug }) => {
    const result = component({ key: '~' })({ parentKey: '', state: createState(state, isDebug), isDebug });
    element.appendChild(result.el);
  }
  return { createComponent, createApp }
})()
