// @flow
// carbondream - Copyright 2017 Zeroarc Software, LLC
// Top level container component

'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import * as Immutable from 'immutable';
import Autobind from 'autobind-decorator';

import Annotation from './Annotation';
import ModeToggle from './ModeToggle';

import type { 
  Annotation as AnnotationType,
  Mode, 
  Offset
} from './flowTypes';

type Props = {
  allowEdit: bool,
  allowDelete: bool,
  annotations: *,
  hidden: bool,
  onSave: () => void,
  onDelete: () => void,
  scale: number,
  selectedId: number,
  viewOnlyMode: bool,

  // Optional
  onDeselect?: () => void,
  onSelect?: () => void,
};

type State = {
  pendingAnnotation: AnnotationType | null,
  visibleViewerId: number,
  mode: Mode,
  containerOffset: Offset,
};

@Autobind
export class Container extends React.Component {
  props: Props;
  state: State;
  viewerHideTimer: number;

  static defaultProps: {
    viewOnlyMode: bool,
    selectedId: number,
    scale: number,
    hidden: bool,
  }

  constructor(props: Props) {
    super(props);

    this.state = {
      pendingAnnotation: null,
      visibleViewerId: props.selectedId || 0,
      mode: 'marker',
      containerOffset: {vertical: 0, horizontal: 0, shadow: null},
    };
  }

  // Listen for props in order to overwrite visible viewer with prop
  componentWillReceiveProps(nextProps: Props) {
    this.setState({visibleViewerId: nextProps.selectedId});
  }

  componentDidMount() {
    const component = ReactDOM.findDOMNode(this);
    if (!component) return;
    component.addEventListener("scroll", this.updateOffset);
    this.updateOffset();
  }

  componentWillUnmount() {
    const component = ReactDOM.findDOMNode(this);
    if (!component) return;
    component.addEventListener("scroll", this.updateOffset);
  }

  render() {
    const pA = this.state.pendingAnnotation;

    let pAnnotationComponent = '';
    if (pA && !this.props.hidden) {
      pAnnotationComponent = <Annotation id={pA.get('id')}
        allowDelete={false}
        allowEdit={false}
        content={pA.get('content')}
        pending={true}
        priority={0}
        drawing={pA.get('drawing')}
        saveAnnotation={this.saveAnnotation}
        cancelAnnotation={this.cancelAnnotation}
        deleteAnnotation={this.deleteAnnotation}
        deemphasize={false}
        type={pA.get('type')}
        containerOffset={this.state.containerOffset}
        author={pA.get('author')}
        viewOnlyMode={false}
        x1={pA.get('x1') * this.props.scale}
        y1={pA.get('y1') * this.props.scale}
        x2={pA.get('x2') * this.props.scale}
        y2={pA.get('y2') * this.props.scale} />;
    }

    // Sorting the annotations: largest area to smallest area, then highlights, then markers
    // This allows us to assign a priority with biggest shapes being lowest in order to
    // calculate a z-index that stacks them accordingly
    const sortedAnnotations = this.props.annotations.sort((a1, a2) => {
      const m1 = a1.toJS();
      const m2 = a2.toJS();

      if (m1.type === 'marker' || m2.type === 'marker') {
        if (m1.type === m2.type) return 0;
        if (m1.type === 'marker') return 1;
        return -1;
      }

      if (m1.type === 'highlight' || m2.type === 'highlight') {
        if (m1.type === m2.type) return 0;
        if (m1.type === 'highlight') return 1;
        return -1;
      }

      const m1Area = Math.abs((m1.x1 - m1.x2) * (m1.y1 - m1.y2));
      const m2Area = Math.abs((m2.x1 - m2.x2) * (m2.y1 - m2.y2));

      return m2Area - m1Area;
    });

    let annotations = '';
    if (!this.props.hidden) {
      annotations = sortedAnnotations.map((a, i) => {
        return (
          <Annotation 
            allowDelete={this.props.allowDelete}
            allowEdit={this.props.allowEdit}
            key={a.get('id')}
            id={a.get('id')}
            priority={i + 1}
            content={a.get('content')}
            timeStamp={a.get('timeStamp')}
            pending={false}
            shouldDisplayViewer={a.get('id') === this.state.visibleViewerId}
            deemphasize={this.state.visibleViewerId !== 0 && a.get('id') !== this.state.visibleViewerId}
            displayAnnotationViewer={this.displayAnnotationViewer}
            hideAnnotationViewer={this.hideAnnotationViewer}
            deleteAnnotation={this.deleteAnnotation}
            editAnnotation={this.editAnnotation}
            viewOnlyMode={this.props.viewOnlyMode}
            type={a.get('type')}
            author={a.get('author')}
            containerOffset={this.state.containerOffset}
            x1={a.get('x1') * this.props.scale}
            y1={a.get('y1') * this.props.scale}
            x2={a.get('x2') * this.props.scale}
            y2={a.get('y2') * this.props.scale} />
        );
      });
    }


    return (
      <div ref='cdContainer' className='cd-container' style={{backgroundColor: 'rgba(0,0,0,0)' /*IE 10 click event workaround*/ }}
        onClick={this.handleClick}
        onMouseDown={this.handleMouseDown}
        onMouseUp={this.handleMouseUp}
        onMouseMove={this.handleMouseMove} >
        {this.props.viewOnlyMode || <ModeToggle mode={this.state.mode} switchMode={this.switchMode} />}
        {annotations}
        {pAnnotationComponent}
      </div>
    );
  }

  //
  // Custom methods
  //

  updateOffset() {
    const offset = this.offset(ReactDOM.findDOMNode(this));
    this.setState({containerOffset: offset});
  }

  offset(element: null | Element | Text): Offset {
    const doc = element && element.ownerDocument;

    if (!doc || !element || typeof element.getBoundingClientRect !== 'function') {
      return { vertical: 0, horizontal: 0, shadow: null};
    }

    const box = element.getBoundingClientRect();

    return {
      vertical: box.top,
      horizontal: box.left,
      shadow: null,
    };
  }

  handleClick(e: SyntheticMouseEvent) {
    //console.log(`click fired. scale: ${this.props.scale}, offset(top/left): ${this.state.containerOffset.vertical}/${this.state.containerOffset.horizontal}, clientX: ${e.clientX}, clientY: ${e.clientY}, screenX: ${e.screenX}, screenY: ${e.screenY}`  );
    e.stopPropagation();
    if (this.props.viewOnlyMode) return;

    this.updateOffset();

    if (this.state.pendingAnnotation
      || this.state.mode !== 'marker') return;

    const annotation = Immutable.Map({
      content: '',
      timeStamp: new Date(),
      type: this.state.mode,
      x1: Math.round((e.clientX - this.state.containerOffset.horizontal) / this.props.scale),
      y1: Math.round((e.clientY - this.state.containerOffset.vertical) / this.props.scale),
      x2: Math.round((e.clientX + 14 - this.state.containerOffset.horizontal) / this.props.scale), //14 & 24 are the size of the marker
      y2: Math.round((e.clientY + 24 - this.state.containerOffset.vertical) / this.props.scale),
    });

    //console.log(`annotation: scale: ${this.props.scale}, offset(top/left): ${this.state.containerOffset.vertical}/${this.state.containerOffset.horizontal}, x1: ${annotation.get('x1')}, y1: ${annotation.get('y1')}, x2: ${annotation.get('x2')}, y2: ${annotation.get('y2')}`);

    this.setState({
      pendingAnnotation: annotation
    });
  }

  handleMouseDown(e: SyntheticMouseEvent) {
    //console.log(`mousedown fired. scale: ${this.props.scale}, clientX: ${e.clientX}, clientY: ${e.clientY}, screenX: ${e.screenX}, screenY: ${e.screenY}`  );
    e.stopPropagation();
    if (this.props.viewOnlyMode) return;

    this.updateOffset();

    if (this.state.pendingAnnotation || this.state.visibleViewerId || this.state.mode === 'marker') return;

    const annotation = Immutable.Map({
      content: '',
      timeStamp: new Date(),
      type: this.state.mode,
      drawing: true,
      x1: Math.round((e.clientX - this.state.containerOffset.horizontal) / this.props.scale),
      y1: Math.round((e.clientY - this.state.containerOffset.vertical) / this.props.scale),
      x2: Math.round((e.clientX - this.state.containerOffset.horizontal) / this.props.scale),
      y2: Math.round((e.clientY - this.state.containerOffset.vertical) / this.props.scale),
    });

    this.setState({
      pendingAnnotation: annotation,
    });
  }

  handleMouseMove(e: SyntheticMouseEvent) {
    //console.log(`mousemove fired. scale: ${this.props.scale}, clientX: ${e.clientX}, clientY: ${e.clientY}, screenX: ${e.screenX}, screenY: ${e.screenY}`  );
    e.stopPropagation();
    if (this.props.viewOnlyMode) return;

    this.updateOffset();

    if (this.state.visibleViewerId || this.state.mode === 'marker' || !this.state.pendingAnnotation) return;

    // If drawing is not true, then don't proceed
    let annotation = this.state.pendingAnnotation;
    if (annotation === null) return;
    if (!annotation.get('drawing')) return;

    annotation = annotation
      .set('x2', (e.clientX - this.state.containerOffset.horizontal) / this.props.scale)
      .set('y2', (e.clientY - this.state.containerOffset.vertical) / this.props.scale);

    this.setState({pendingAnnotation: annotation});
  }

  handleMouseUp(e: SyntheticMouseEvent) {
    //console.log(`mouseup fired. scale: ${this.props.scale}, clientX: ${e.clientX}, clientY: ${e.clientY}, screenX: ${e.screenX}, screenY: ${e.screenY}`  );
    e.stopPropagation();
    if (this.props.viewOnlyMode) return;

    this.updateOffset();

    if (this.state.visibleViewerId || this.state.mode === 'marker' || !this.state.pendingAnnotation) return;

    // If drawing is false, we have already popped the input dialog
    let annotation = this.state.pendingAnnotation;
    if (annotation === null) return;
    if (!annotation.get('drawing')) return;

    annotation = annotation
      .set('drawing', false)
      .set('x2', Math.round((e.clientX - this.state.containerOffset.horizontal) / this.props.scale))
      .set('y2', Math.round((e.clientY - this.state.containerOffset.vertical) / this.props.scale));

    if (annotation.get('x2') < annotation.get('x1')) {
      const newAnnotation = annotation
        .set('x1', annotation.get('x2'))
        .set('x2', annotation.get('x1'));
      annotation = newAnnotation;
    }

    if (annotation.get('y2') < annotation.get('y1')) {
      const newAnnotation = annotation
        .set('y1', annotation.get('y2'))
        .set('y2', annotation.get('y1'));

      annotation = newAnnotation;
    }

    // Only save the pending change if the mark is bigger than a single point
    // In this case, vertical or horizontal lines are allowed
    if (Math.abs(annotation.get('x2') - annotation.get('x1')) < 1
      && Math.abs(annotation.get('y2') - annotation.get('y1')) < 1) {
        this.setState({pendingAnnotation: null});
    }
    else {
      this.setState({pendingAnnotation: annotation});
    }
  }

  switchMode(mode: Mode) {
    //console.log('mode is now: ' + mode);
    this.setState({mode: mode});

    if (this.state.pendingAnnotation) {
      this.cancelAnnotation();
    }
  }

  saveAnnotation(content: string) {
    if (!this.state.pendingAnnotation) return;

    const a = this.state.pendingAnnotation
      .set('content', content)
      .set('timeStamp', new Date());

    this.props.onSave(a);
    this.setState({pendingAnnotation: null});
  }

  deleteAnnotation(id: number) {
    this.props.onDelete(id);
  }

  // If editing, pull the annotation out and put it in pending, force viewer to null
  editAnnotation(id: number) {
    const annotation = this.props.annotations.find((value) => {
      if (value.get('id') === id) return true;
      return false;
    });

    this.setState({
      pendingAnnotation: annotation,
      visibleViewerId: 0
    });
  }

  cancelAnnotation() {
    // TODO: This delays the close event by 50ms to prevent any other click events from firing
    // Is this gross? I don't even know. Think about it some more and change if it is.
    // Hard to see how to do this without timers or screwing up component isolation
    setTimeout(() => {
      this.setState({pendingAnnotation: null});
    }, 50);
  }

  displayAnnotationViewer(id: number) {
    if (this.state.pendingAnnotation) return;

    clearTimeout(this.viewerHideTimer);

    // If a onSelect handler has been provided, invoke it
    if (this.props.onSelect) {
      this.props.onSelect(id);
    }
    this.setState({visibleViewerId: id});
  }

  hideAnnotationViewer(id: number) {
    clearTimeout(this.viewerHideTimer);

    this.viewerHideTimer = setTimeout(() => {
      // If a onDeselect handler has been provided, invoke it
      if (this.props.onDeselect) {
        this.props.onDeselect();
      }
      this.setState({visibleViewerId: 0});
    }, 250);
  }
}

Container.defaultProps = {
  viewOnlyMode: false,
  selectedId: 0,
  scale: 1,
  hidden: false,
};

export default Container;