import React from 'react'

import THREE from 'three'
import Stats from 'three/examples/js/libs/stats.min'

require('../misc/TrackballControls.js')(THREE)

import 'stylesheets/RenderView'

import _ from 'lodash'
import $ from 'npm-zepto'

import Shaders from '../misc/Shaders.js'

import { generateMockData } from '../misc/Util.js'

// Promise jQuery getJSON version
const getJSON = (url) => new Promise((resolve) => $.getJSON(url, resolve))

export default React.createClass({
  render() {
    return (
      <div ref={(c) => this._container = c} className="render-view">
</div>
    )
  },
  // Perhaps this is added for performance reasons?
  shouldComponentUpdate() {
    console.log('shouldComponentUpdate')
    return false
  },
  componentDidMount() {

    // getJSON('/output.json').then((data) => {
    //
    //   // Normalize data
    //   data.forEach((elem) => {
    //     elem.x *= 1000.0
    //     elem.y *= 1000.0
    //     elem.z *= 1000.0
    //   })
    //
    //   this._setupScene(data)
    // })

    {
      const data = generateMockData()
      this._setupScene(data)
    }

  },
  _setupScene(data) {

    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000)
    camera.position.z = 3000

    const scene = new THREE.Scene()

    const raycaster = new THREE.Raycaster()

    // Increase the default mouseover detection radius of points
    raycaster.params.Points.threshold = 5

    const mouse = new THREE.Vector2()

    // First sort by the group ID ascending
    const sortedData = _.orderBy(data, ['g'], ['asc'])

    // Generate an object consisting out of groups of cluster IDs
    const groupedData = _.groupBy(sortedData, (element) => element.g)

    // Add metadata to each group
    _.each(groupedData, (value, key, coll) => {
      coll[key] = {
        nodes: value,
        color: 0xffffff * Math.random()
      }
    })

    // Extract a pure vector array
    const vertices = data.map((p) => new THREE.Vector3(p.x, p.y, p.z))

    const positions = new Float32Array(vertices.length * 3)
    const colors = new Float32Array(vertices.length * 3)
    const sizes = new Float32Array(vertices.length)

    const PARTICLE_SIZE = 20

    const color = new THREE.Color()

    const group = new THREE.Group()

    for (let i = 0, l = vertices.length; i < l; i++) {

      const vertex = vertices[ i ]
      vertex.toArray(positions, i * 3)

      color.setHex(groupedData[data[i].g].color)
      color.toArray(colors, i * 3)

      sizes[i] = PARTICLE_SIZE

    }

    const geometry = new THREE.BufferGeometry()
    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.addAttribute('customColor', new THREE.BufferAttribute(colors, 3))
    geometry.addAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color:   { type: 'c', value: new THREE.Color( 0xffffff ) },
        texture: { type: 't', value: new THREE.TextureLoader().load( 'images/disc.png' ) }
      },
      vertexShader: Shaders.points.vertexShader,
      fragmentShader: Shaders.points.fragmentShader,
      alphaTest: 0.9,
      depthTest: false
    })

    const particles = new THREE.Points(geometry, material)
    group.add(particles)

    // To achieve an effect similar to the mocks, we need to shoot a line
    // at another node that is most near, except if node that was already drawn to
    _.forEach(groupedData, (value) => {
      const geometry = new THREE.Geometry()

      const lineMaterial = new THREE.LineBasicMaterial({
        color: value.color,
        blending:     THREE.AdditiveBlending,
        depthTest:    false,
        transparent:  true,
        opacity: 0.18
      })

      const vertices = value.nodes.map((p) => new THREE.Vector3(p.x, p.y, p.z))

      const findClosestVertex = (list, other, closeNess=0) => {
        const clonedArr = _.without(_.clone(list), other)
        clonedArr.sort((a, b) => a.distanceToSquared(other) - b.distanceToSquared(other))
        return clonedArr[closeNess]
      }

      const allowedVerticesToSearch = _.clone(vertices)

      const sortedVertices = []

      const doSearch = (list, v) => {
        if (sortedVertices.length === 0) {
          sortedVertices.push(v)
        }

        list = _.without(list, v)
        const nextVertex = findClosestVertex(list, v)
        if (nextVertex) {
          sortedVertices.push(nextVertex)
          doSearch(list, nextVertex)
        }
      }

      doSearch(allowedVerticesToSearch, vertices[0])

      geometry.vertices = sortedVertices

      const line = new THREE.Line( geometry, lineMaterial )

      group.add(line)
    })

    scene.add(group)

    const controls = new THREE.TrackballControls(camera)

    controls.rotateSpeed = 1.0
    controls.zoomSpeed = 1.2
    controls.panSpeed = 0.8

    controls.noZoom = false
    controls.noPan = false

    controls.staticMoving = true
    controls.dynamicDampingFactor = 0.3

    controls.keys = [ 65, 83, 68 ]

    const renderer = new THREE.WebGLRenderer()
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    this._container.appendChild(renderer.domElement)

    const stats = new Stats()
    stats.domElement.style.position = 'absolute'
    stats.domElement.style.top = '0px'
    this._container.appendChild(stats.domElement)

    document.addEventListener( 'mousemove', () => {
      mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1
      mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1
    }, false)

    window.addEventListener('resize', () => {

      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()

      renderer.setSize(window.innerWidth, window.innerHeight)

      controls.handleResize()

    }, false)

    let lastIntersectIndex = null

    const tick = () => {
      group.rotation.x += 0.00005
      group.rotation.y += 0.0001

      const geometry = particles.geometry
      const attributes = geometry.attributes

      raycaster.setFromCamera( mouse, camera )

      const intersects = raycaster.intersectObject(particles)

      if ( intersects.length > 0 ) {

        if ( lastIntersectIndex != intersects[ 0 ].index ) {

          if (lastIntersectIndex) {
            attributes.size.array[ lastIntersectIndex ] = PARTICLE_SIZE

            const color = new THREE.Color()
            color.setHex(groupedData[data[lastIntersectIndex].g].color)
            color.toArray(attributes.customColor.array, lastIntersectIndex * 3)
          }

          lastIntersectIndex = intersects[ 0 ].index

          attributes.size.array[ lastIntersectIndex ] = PARTICLE_SIZE * 2
          attributes.size.array[ lastIntersectIndex ] = PARTICLE_SIZE * 2
          attributes.size.needsUpdate = true

          color.setRGB(255, 255, 255)
          color.toArray(attributes.customColor.array, lastIntersectIndex * 3)

          attributes.customColor.needsUpdate = true

        }

      } else if ( lastIntersectIndex !== null ) {

        attributes.size.array[ lastIntersectIndex ] = PARTICLE_SIZE
        attributes.size.needsUpdate = true

        const color = new THREE.Color()
        color.setHex(groupedData[data[lastIntersectIndex].g].color)
        color.toArray(attributes.customColor.array, lastIntersectIndex * 3)
        attributes.customColor.needsUpdate = true

        lastIntersectIndex = null

      }

    }

    const animate = () => {

      stats.begin()

      controls.update()

      requestAnimationFrame(animate)

      tick()

      stats.end()

      renderer.render(scene, camera)

    }

    animate()

  }
})
