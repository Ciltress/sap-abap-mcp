# Parallel and background processing

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Parallel Processing
- Running Code in the Background

---

## Parallel Processing

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_ABAP_PARALLEL</code> </td>
<td>
For performing the parallel processing for instances of ABAP Objects. For more information, refer to the class documentation. 
<br><br>

The following example class demonstrates parallel processing using the `CL_ABAP_PARALLEL` class.

<details>
  <summary>🟢 Click to expand for more information and example code</summary>
  <!-- -->

Notes on the example: 
- As a prerequisite, ensure you have a class implementing the `IF_ABAP_PARALLEL` interface. In this self-contained example, the executable class itself implements it. 
- Before running the class with F9 in ADT, set a breakpoint for the `ASSERT` statement in the implementation of the `if_oo_adt_classrun~main` method. 
- The example visualizes parallel processing by adding timestamps to an internal table. When program execution stops, you can check the table contents.
- First, instances of the example class are created for the parallel processing of instances.
- Next, an instance of the `CL_ABAP_PARALLEL` class is created. The example omits optional parameters; refer to the class documentation for details.
- Parallel processing begins with the `run_inst` method, adding the instances to the input parameter.
- A table of result information for tasks is returned and stored in a data object.
- After starting the parallel processing, the `if_abap_parallel~do` method is called for each instance. This method includes a `DO` loop that populates the `info` table with timestamps.
- The example includes a `WAIT` statement to pause program execution to ensure that all the parallel processing runs have completed.
- The result information table is then looped over, and details are accessed by casting to the respective class (in this case, the example class).
- The `info` table is sorted by timestamps. In the debugger, you can explore the functionality of the parallel processing in the following ways:
  - The `instance` component may show a random instance, like `inst3`, processed first.
  - Due to many loop passes, other instances might start in parallel before the current instance finishes. The `instance` component might show, for example, that `inst3` was processed first while `inst1` began. Some `time_stamp` values may even show identical values.

<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    INTERFACES if_abap_parallel.
    METHODS constructor IMPORTING text TYPE string OPTIONAL.
  PROTECTED SECTION.
  PRIVATE SECTION.
    DATA instance_name TYPE string.
    DATA time_stamp TYPE utclong.

    TYPES: BEGIN OF struct,
             time_stamp   TYPE utclong,
             instance TYPE string,
             comment  TYPE string,
           END OF struct.
    DATA info TYPE TABLE OF struct WITH EMPTY KEY.
    DATA parallel_proc LIKE info.

ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    APPEND VALUE #( time_stamp = time_stamp instance = `----` comment = `Time stamp stored when first running/calling the class` ) TO info.

    DATA(inst1) = NEW zcl_demo_abap( `inst1` ).
    DATA(inst2) = NEW zcl_demo_abap( `inst2` ).
    DATA(inst3) = NEW zcl_demo_abap( `inst3` ).
    DATA(inst4) = NEW zcl_demo_abap( `inst4` ).
    DATA(inst5) = NEW zcl_demo_abap( `inst5` ).

    APPEND VALUE #( time_stamp = utclong_current( ) instance = `----` comment = `Time stamp stored before starting parallel processing` ) TO info.

    DATA(parallel) = NEW cl_abap_parallel( ).

    parallel->run_inst( EXPORTING p_in_tab  = VALUE #( ( inst1 )
                                                       ( inst2 )
                                                       ( inst3 )
                                                       ( inst4 )
                                                       ( inst5 ) )
                        IMPORTING p_out_tab = DATA(result_info) ).

    APPEND VALUE #( time_stamp = utclong_current( ) instance = `----` comment = `Time stamp stored after starting parallel processing` ) TO info.

    WAIT UP TO 1 SECONDS.

    APPEND VALUE #( time_stamp = utclong_current( ) instance = `----` comment = `Time stamp stored after the WAIT statement` ) TO info.

    LOOP AT result_info INTO DATA(wa).
      DATA(res) = CAST zcl_demo_abap( wa-inst ).
      APPEND LINES OF res->parallel_proc TO info.
      APPEND VALUE #( time_stamp = res->time_stamp instance = res->instance_name comment = `Time stamp stored in constructor implementation when instantiating class` ) TO info.
    ENDLOOP.

    SORT info BY time_stamp ASCENDING.

    ASSERT 1 = 1.
  ENDMETHOD.

  METHOD if_abap_parallel~do.
    DO 1000 TIMES.
      APPEND VALUE #( time_stamp = utclong_current( ) instance = instance_name comment = |Entry { sy-index } added within "do" method| ) TO parallel_proc.
    ENDDO.
  ENDMETHOD.

  METHOD constructor.
    IF text IS SUPPLIED AND text IS NOT INITIAL.
      instance_name =  text.
    ENDIF.
    time_stamp = utclong_current( ).
  ENDMETHOD.

ENDCLASS.
```

</details> 

</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>

## Running Code in the Background

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_BGMC_PROCESS_FACTORY</code> </td>
<td>


- Used in the context of the Background Processing Framework (bgPF) to run code asynchronously in the background.
- Different flavors are available:
  - Using bgPF without transactional control, for example, if you do not work with a RAP application or transactional control is not relevant in an ABAP program. In this case, you can implement the <code>IF_BGMC_OP_SINGLE_TX_UNCONTR</code> interface. 
  - Using bgPF with transactional control, for example, if you work with a RAP application. In that case, you can implement the <code>IF_BGMC_OP_SINGLE</code> interface. Note: If you are in a RAP context, you do not need to implement <code>COMMIT/ROLLBACK WORK</code> because the RAP framework takes care of it.
- More information: 
  - <a href="https://help.sap.com/docs/abap-cloud/abap-concepts/background-processing-framework ">Background Processing Framework</a>
  - Transactional control with the <a href="https://help.sap.com/docs/abap-cloud/abap-concepts/controlled-sap-luw">controlled SAP LUW</a>


**Example 1: Using bgPF without transactional control**

<details>
  <summary>🟢 Click to expand for example code (<i>Example 1</i>) </summary>
  <!-- -->

<br>
The following, self-contained, and oversimplified example is intended to give a rough idea about the functionality. It does not include transactional control. The example class can be run using F9 in ADT. It does the following: A demo database table of the cheat sheet repository is filled synchronously and asynchronously (using bgPF) with entries, just to show an effect and get an idea. Two entries are created in the background. <code>WAIT</code> statements are included to have a self-contained example, and that all created database entries can be shown in the output. In the example, the background processing may be visualized, for example, by the <code>MODIFY</code> statement that is followed by a <code>WAIT</code> statement in the loop. The output can show that the entry for the first asynchronously created entry was added before a synchronously created entry. For more visualization options regarding the execution in the background, you can, for example, check the ABAP Cross Trace. For more information, refer to the documentation.

<br>

``` abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    INTERFACES if_bgmc_op_single_tx_uncontr.
    CLASS-METHODS get_uuid RETURNING VALUE(uuid) TYPE sysuuid_x16.
  PRIVATE SECTION.
    CLASS-DATA number TYPE i.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    "Deleting a demo database table
    DELETE FROM zdemo_abap_tabca.

    number += 1.
    MODIFY zdemo_abap_tabca FROM @( VALUE #(
      id = get_uuid( )
      calc_result = |Synchronous entry creation in the MAIN method { number }|
      crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).

    "Processing code in the background
    DO 2 TIMES.
      "Creating an instance of the example class (that implements the bgPF-relevant
      "interface if_bgmc_op_single_tx_uncontr)
      DATA(inst) = NEW zcl_demo_abap(  ).

      TRY.
          "Getting the default factory for transactional background processes and
          "creating a process for a single operation
          DATA(backgr) = cl_bgmc_process_factory=>get_default( )->create( ).
          "Setting a name of the process
          backgr->set_name( `bgPF Test` ).
          "Setting the transactionally uncontrolled operation of the process
          backgr->set_operation_tx_uncontrolled( inst ).
          "Saving the background process for the asynchronous execution
          backgr->save_for_execution(  ).
          "An explicit COMMIT WORK is required to start the background process.
          "This explicit call is not needed in the context of RAP because the RAP
          "framework will take care of the commit call.
          COMMIT WORK.
        CATCH cx_bgmc INTO DATA(error).
          out->write( error->get_text( ) ).
          ROLLBACK WORK.
      ENDTRY.

      number += 1.
      MODIFY zdemo_abap_tabca FROM @( VALUE #(
        id = get_uuid( )
        calc_result = |Synchronous entry creation in the MAIN method { number }|
        crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).
      WAIT UP TO 1 SECONDS.
    ENDDO.

    WAIT UP TO 2 SECONDS.

    "Displaying the content of a demo database table that was filled
    "in the course of the class execution
    SELECT id, calc_result, crea_date_time
      FROM zdemo_abap_tabca
      ORDER BY crea_date_time
      INTO TABLE @DATA(itab).

    out->write( itab ).
  ENDMETHOD.

  METHOD if_bgmc_op_single_tx_uncontr~execute.
    MODIFY zdemo_abap_tabca FROM @( VALUE #(
      id = get_uuid( )
      calc_result = `Asynchronous entry creation in background in the EXECUTE method`
      crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).
  ENDMETHOD.

  METHOD get_uuid.
    TRY.
        uuid = cl_system_uuid=>create_uuid_x16_static( ) .
      CATCH cx_uuid_error.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
``` 

</details>  

<br>

**Example 2: Using bgPF with transactional control**

<details>
  <summary>🟢 Click to expand for example code (<i>Example 2</i>)</summary>
  <!-- -->

<br>

This example is similar to example 1. Unlike example 1, example 2 executes operations under transactional control. The transactional phase is explicitly switched using the `cl_abap_tx` class.

<br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
    INTERFACES if_bgmc_op_single.
    METHODS constructor IMPORTING num TYPE i OPTIONAL.

  PRIVATE SECTION.
    DATA num TYPE i.
    DATA uuid TYPE sysuuid_x16.
    DATA timestamp TYPE utclong.
    METHODS modify.
    METHODS save.
    METHODS get_uuid RETURNING VALUE(uuid) TYPE sysuuid_x16.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.
    "Deleting a demo database table
    DELETE FROM zdemo_abap_tabca.

    "Synchronous entry creation
    MODIFY zdemo_abap_tabca FROM @( VALUE #(
      id = get_uuid( )
      calc_result = |Synchronous entry creation in the MAIN method. "num" value: { num }|
      crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).

    "Processing code in the background
    DO 2 TIMES.
      "Creating an instance of the example class (that implements the bgPF-relevant
      "interface if_bgmc_op_single)
      DATA(inst) = NEW zcl_demo_abap( num = sy-index ).

      TRY.
          "Getting the default factory for transactional background processes and
          "creating a process for a single operation
          DATA(backgr) = cl_bgmc_process_factory=>get_default( )->create( ).
          "Setting a name of the process
          backgr->set_name( `bgPF Test` ).
          "Setting the transactionally controlled operation of the process
          backgr->set_operation( inst ).
          "Saving the background process for the asynchronous execution
          backgr->save_for_execution(  ).
          "An explicit COMMIT WORK is required to start the background process.
          "This explicit call is not needed in the context of RAP because the RAP
          "framework will take care of the commit call.
          COMMIT WORK.
        CATCH cx_bgmc INTO DATA(error).
          out->write( error->get_text( ) ).
          ROLLBACK WORK.
      ENDTRY.

      "Another synchronous entry creation
      MODIFY zdemo_abap_tabca FROM @( VALUE #(
        id = get_uuid( )
        calc_result = |Synchronous entry creation in the MAIN method. "num" value: { num }|
        crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).
      WAIT UP TO 1 SECONDS.
    ENDDO.

    WAIT UP TO 2 SECONDS.

    "Displaying the content of a demo database table that was filled
    "in the course of the class execution
    SELECT id, calc_result, crea_date_time
      FROM zdemo_abap_tabca
      ORDER BY crea_date_time
      INTO TABLE @DATA(itab).

    out->write( itab ).
  ENDMETHOD.

  METHOD if_bgmc_op_single~execute.
  "Executing the operation under transactional control
  "Note:
  "- The method execution is started in the MODIFY transactional phase
  "- This means that only those operations are allowed that do not violate
  "  transactional contracts to guarantee transactional consistency.
  "- As an example, database modifications performed when the MODIFY transactional
  "  phase is active are not allowed.
  "- When the transactional phase is switched from MODIFY to SAVE, such database
  "  modifications are allowed.
  "- This may happen explicitly using the save method of the cl_abap_tx class,
  "  as is the case in the example.
  "- You can try out the following: Comment out the cl_abap_tx=>save( ). statement,
  "  and run the example again. It results in a runtime error.

    "Includes the modification of class attributes
    modify( ).

    "Explicitly switches from the MODIFY to the SAVE transactional phase
    cl_abap_tx=>save( ).

    "Includes a database modification
    save( ).
  ENDMETHOD.

  METHOD get_uuid.
    TRY.
        uuid = cl_system_uuid=>create_uuid_x16_static( ).
      CATCH cx_uuid_error.
    ENDTRY.
  ENDMETHOD.
  METHOD constructor.
    IF num IS SUPPLIED.
      me->num = num.
    ENDIF.
  ENDMETHOD.

  METHOD modify.
    me->uuid = get_uuid( ).
    me->timestamp = utclong_current( ).
  ENDMETHOD.

  METHOD save.
    MODIFY zdemo_abap_tabca FROM @( VALUE #(
      id = uuid
      calc_result = |Asynchronous entry creation in background in the EXECUTE method. "num" value: { num }|
      crea_date_time = cl_abap_tstmp=>utclong2tstmp( utclong_current( ) ) ) ).
  ENDMETHOD.

ENDCLASS.
```

</details>  



</td>
</tr>
</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
