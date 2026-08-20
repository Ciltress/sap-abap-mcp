# Transport requests and releasing APIs

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Programmatically Creating and Releasing Transport Requests
- Releasing APIs

---

## Programmatically Creating and Releasing Transport Requests

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>XCO_CP_CTS</code> </td>
<td>

The following code snippet uses the `XCO_CP_CTS` class, among others, to demonstrate:

- Programmatically creating a transport request 
- Retrieving information about the transport request
- Excursions:
  - Programmatically creating a demo class (`ZCL_DEMO_ABAP_CALCULATE`) and assigning it to the new transport request. This simple, executable class inherits from `CL_XCO_CP_ADT_SIMPLE_CLASSRUN` and includes the `calculate` method.
  - Dynamically calling the `calculate` method to confirm the class creation. For more details, refer to the [Dynamic Programming](06_Dynamic_Programming.md) cheat sheet.
- Programmatically releasing a transport task and request

> [!NOTE]  
> - The example is simplified and non-semantic, exploring various functionalities offered by the XCO APIs. See the repository's [disclaimer](./README.md#%EF%B8%8F-disclaimer).
> - For more information and code snippets, refer to the [SAP Help documentation](https://help.sap.com/docs/btp/sap-business-technology-platform/correction-and-transport-system).
> - The example assumes you have a transportable package, represented by the `pkg_name` constant in the example.
> - To try the example out, create a demo class named `ZCL_DEMO_ABAP` and paste the code into it. Edit the code by providing the `pkg_name` constant with your package name. It is assumed that a demo class named `ZCL_DEMO_ABAP_CALCULATE` does not exist. After activation, choose *F9* in ADT to execute the class. The example is set up to display output in the console. You may also want to open the created `ZCL_DEMO_ABAP_CALCULATE` class.

 <br>

<details>
  <summary>🟢 Click to expand for example code</summary>
  <!-- -->

<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_demo_abap IMPLEMENTATION.

  METHOD if_oo_adt_classrun~main.

    "Constant names used in the example
    "Name of a package that is assigned a demo class that is to be transported
    CONSTANTS pkg_name TYPE sxco_package VALUE 'Z_SOME_PACKAGE'.
    "Names of a class and a method to be created
    CONSTANTS cl_name TYPE sxco_ao_object_name VALUE 'ZCL_DEMO_ABAP_CALCULATE'.
    CONSTANTS meth_name TYPE if_xco_gen_clas_s_fo_d_section=>tv_method_name VALUE 'CALCULATE'.

*&---------------------------------------------------------------------*
*& Creating transport request
*&---------------------------------------------------------------------*

    "Getting transport- and package-related information
    DATA(pkg) = xco_cp_abap_repository=>package->for( pkg_name ).
    IF pkg->exists( ) = abap_false.
      out->write( |Package { pkg_name } does not exist.| ).
      RETURN.
    ENDIF.

    DATA(pkg_read) = pkg->read( ).

    "Transport layer
    DATA(tr_layer) = pkg_read-property-transport_layer->value.
    "Transportation target
    DATA(tr_target) = pkg_read-property-transport_layer->get_transport_target( )->value.
    "Package type
    DATA(pkg_type) = pkg_read-property-package_type->value.
    "Software component
    DATA(software_comp) = pkg_read-property-software_component->name.

    IF tr_layer IS NOT INITIAL.
      out->write( |Transport layer: { tr_layer }| ).
    ENDIF.
    IF tr_target IS NOT INITIAL.
      out->write( |Transport target: { tr_target }| ).
    ENDIF.
    IF pkg_type IS NOT INITIAL.
      out->write( |Package type: { pkg_type }| ).
    ENDIF.
    IF software_comp IS NOT INITIAL.
      out->write( |Software component: { software_comp }| ).
    ENDIF.

    "Creating transport request with an unclassified task based on the transport target
    DATA(tr_request) = xco_cp_cts=>transports->workbench( tr_target )->create_request( 'Some transport request' ).
    DATA(tr_req_id) = tr_request->value.

    out->write( |Transport request ID: { tr_req_id }| ).

*    "Attribute information about transport request
*    DATA tr_attribute_infos TYPE string_table.
*    DATA(tr_attributes) = tr_request->attributes->all->get( ).
*    LOOP AT tr_attributes INTO DATA(attr).
*      DATA(attr_name) = attr->get_attribute( )->name.
*      DATA(attr_value) = attr->get_value( ).
*      APPEND |Attribute "{ attr_name }", value "{ attr_value }"| TO tr_attribute_infos.
*    ENDLOOP.
*
*    IF tr_attribute_infos IS NOT INITIAL.
*      out->write( `Transport request attributes:` ).
*      out->write( tr_attribute_infos ).
*    ENDIF.

    "Transport request status
    DATA(tr_status) = tr_request->get_status( )->value.
    out->write( |Transport request status: { tr_status }| ).

    "Retrieving information about tasks
    DATA(tr_req_tasks) = tr_request->get_tasks( ).

    DATA tr_tasks_info TYPE string_table.
    LOOP AT tr_req_tasks INTO DATA(task).
      DATA(task_value) = task->value.
      DATA(request_of_task) = task->get_request( )->value.
      DATA(status_of_task) = task->get_status( )->value.
      DATA(task_last_changed) = task->properties( )->get_last_changed( )->as( xco_cp_time=>format->iso_8601_extended )->value.
      DATA(task_owner) = task->properties( )->get_owner( )->name.
      DATA(task_descr) = task->properties( )->get_short_description( ).
      APPEND |Task "{ task_value }", request "{ request_of_task }", status "{ status_of_task }", last changed at "{ task_last_changed }", | &&
      |owner "{ task_owner }", description "{ task_descr }"| TO tr_tasks_info.
    ENDLOOP.

    out->write( `Transport tasks:` ).
    out->write( tr_tasks_info ).

*&---------------------------------------------------------------------*
*& Excursion: Creating a demo class programmatically and assigning it
*&            to the transport request
*&---------------------------------------------------------------------*

    DATA(demo_cl) = xco_cp_abap=>class( cl_name ).

    "Checking if the class exists
    IF demo_cl->exists( ).
      out->write( |Class { cl_name } already exists.| ).
      RETURN.
    ENDIF.

    "Using the XCO generation API
    DATA(env) = xco_cp_generation=>environment->dev_system( tr_req_id ).
    DATA(put) = env->create_put_operation( ).
    DATA(cl_spec) = put->for-clas->add_object( cl_name )->set_package( pkg_name )->create_form_specification( ).

    "Setting up the class
    cl_spec->set_short_description( 'Demo class' ).
    cl_spec->definition->set_superclass( 'CL_XCO_CP_ADT_SIMPLE_CLASSRUN' ).
    cl_spec->definition->set_create_visibility( xco_cp_abap_objects=>visibility->public ).
    cl_spec->definition->set_final( ).

    "Method/type definitions in the public visibility section
    cl_spec->definition->section-public->add_method( 'constructor' ).
    cl_spec->definition->section-public->add_method( 'main' )->set_redefinition( ).
    cl_spec->definition->section-public->add_type( `op` )->for( xco_cp_abap=>type-source->for( 'c LENGTH 1' ) ).

    DATA(calc) = cl_spec->definition->section-public->add_method( meth_name ).
    calc->add_importing_parameter( 'num1' )->set_pass_by_reference( )->set_type( xco_cp_abap=>type-source->for( 'i' ) ).
    calc->add_importing_parameter( 'operator' )->set_pass_by_reference( )->set_type( xco_cp_abap=>type-source->for( 'op' ) ).
    calc->add_importing_parameter( 'num2' )->set_pass_by_reference( )->set_type( xco_cp_abap=>type-source->for( 'i' ) ).
    calc->add_returning_parameter( 'result' )->set_type( xco_cp_abap=>type-source->for( 'decfloat34' ) ).

    "Method implementations
    cl_spec->implementation->add_method( `constructor` )->set_source( VALUE #( ( `super->constructor( ).` ) ) ).

    cl_spec->implementation->add_method( 'main' )->set_source( VALUE #( ( |DATA(result) = { meth_name }( num1 = 1 operator = '+' num2 = 2 ).| )
                                                                        ( `out->write( result ).` ) ) ).

    cl_spec->implementation->add_method( 'calculate' )->set_source( VALUE #( ( `CASE operator.` )
                                                                             ( `WHEN '+'. result = num1 + num2.` )
                                                                             ( `WHEN '-'. result = num1 - num2.` )
                                                                             ( `WHEN '*'. result = num1 * num2.` )
                                                                             ( `WHEN '/'. result = num1 / num2.` )
                                                                             ( `WHEN OTHERS. result = 0.` )
                                                                             ( `ENDCASE.` ) ) ).

    TRY.
        DATA(creation_result) = put->execute( ).
        out->write( |Class { cl_name } generated.| ).
      CATCH cx_xco_gen_put_exception INTO DATA(err).
        out->write( err->get_text( ) ).
        RETURN.
    ENDTRY.

*&---------------------------------------------------------------------*
*& Excursion: Calling a method in the newly created class dynamically
*&---------------------------------------------------------------------*

    DATA oref TYPE REF TO object.
    CREATE OBJECT oref TYPE (cl_name).

    DATA dref TYPE REF TO data.
    DATA(type_name) = |{ cl_name }=>OP|.
    CREATE DATA dref TYPE (type_name).
    dref->* = '*'.

    DATA(ptab) = VALUE abap_parmbind_tab( ( name  = 'NUM1'
                                            kind  = cl_abap_objectdescr=>exporting
                                            value = NEW i( 5 ) )
                                          ( name  = 'OPERATOR'
                                            kind  = cl_abap_objectdescr=>exporting
                                            value = dref )
                                          ( name  = 'NUM2'
                                            kind  = cl_abap_objectdescr=>exporting
                                            value = NEW i( 5 ) )
                                          ( name  = 'RESULT'
                                            kind  = cl_abap_objectdescr=>returning
                                            value = NEW decfloat34( ) ) ).

    CALL METHOD oref->(meth_name) PARAMETER-TABLE ptab.

    DATA(result) = CONV decfloat34( ptab[ name = 'RESULT' ]-value->* ).

    out->write( |Calculation result when calling method { meth_name } of class { cl_name }: { result }| ).

*&---------------------------------------------------------------------*
*& Releasing transport tasks and request
*&---------------------------------------------------------------------*

    DATA(cl_handler) = xco_cp_abap_repository=>object->clas->for( cl_name ).
    "You might also use the handler demo_cl from above.

    "Checking if the class is locked in a transport request
    IF cl_handler->if_xco_cts_changeable~get_object( )->is_locked( ) = abap_true.
      DATA(tr_lock) = cl_handler->if_xco_cts_changeable~get_object(
        )->get_lock(
        )->get_transport( ).

      DATA(tr_req_for_cl) = xco_cp_cts=>transport->for( tr_lock )->get_request( )->value.
      out->write( |Class { cl_name } is currently locked in TR { tr_req_for_cl }| ).
    ENDIF.

    "Releasing the tasks
    DATA(tr_tasks) = tr_request->get_tasks( ).

    LOOP AT tr_tasks INTO DATA(tr_task).
      IF tr_task->get_status( ) = xco_cp_transport=>status->modifiable.
        tr_task->release( ).
      ENDIF.
    ENDLOOP.

    "Releasing the transport request
    TRY.
        tr_request->release( ).
        out->write( |Transport { tr_req_id } request released| ).
        tr_status = tr_request->get_status( )->value.
        out->write( |Transport request status: { tr_status }| ).
      CATCH cx_xco_runtime_exception INTO DATA(rel_error).
        out->write( rel_error->get_text( ) ).
    ENDTRY.

  ENDMETHOD.

ENDCLASS.
``` 

</details>  
</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Releasing APIs

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_API_STATE</code> </td>
<td>

- You can use the class to release APIs programmatically. Note that you can also achieve this using ADT tools. 
- Find more information in the class documentation.
- The code snippets uses various methods offered by the class and illustrates the following aspects: creating an instance of the API state handler for a specified API (a demo class is inserted), releasing the API for ABAP for Cloud Development (by also specifying a transport request), retrieving release information, and deleting the release state for the specified API again. 
 
<br>

```abap
TRY.
    DATA(api_state) = cl_abap_api_state=>create_instance( api_key = VALUE #( object_type = 'CLAS' object_name = 'ZCL_DEMO_TEST' ) ).

    api_state->release( use_in_cloud_development = abap_true
                        use_in_key_user_apps     = abap_false
                        request                  = 'SOME_TR_REQ' ).

    DATA(rel_info) = api_state->get_release_info( ).

    DATA(is_released) = api_state->is_released( use_in_cloud_development = abap_true
                                                use_in_key_user_apps     = abap_false ).

    IF is_released = abap_true.
      api_state->delete_release_state( request = 'SOME_TR_REQ' ).

      rel_info = api_state->get_release_info( ).

      is_released = api_state->is_released( use_in_cloud_development = abap_true
                                            use_in_key_user_apps     = abap_false ).

    ENDIF.

  CATCH cx_abap_api_state INTO DATA(error).
    DATA(error_text) = error->get_text( ).
ENDTRY.
``` 

</td>
</tr>


</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
